/**
 * Context Manifest Handlers
 * Handler functions for context manifest MCP tools.
 * Reads a local .ezmodo/manifest/manifest.json when present, else the Go API.
 * Writes go to the API, the manifest's source of truth (see update_manifest_entries).
 *
 * `getContext` is the unified handler replacing searchProjectContext,
 * getRelatedFilesHandler, getProjectOverviewHandler, getCriticalFilesHandler,
 * queryProjectGraph, analyzeImpact, getGraphStats, and analyzeProjectOrganization.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import {
  loadManifest,
  reloadManifest,
  saveManifest,
  getManifestSource,
  resolveManifestProjectId,
} from '../lib/manifest-loader.js';
import { callEzmodoAPI } from '../lib/http-client.js';
import {
  getContextForTags,
  getContextForTask,
  getRelatedFiles,
  getProjectOverview,
  formatContextForPrompt,
  suggestSimilarPaths,
  getCriticalFiles,
  updateManifestEntries,
  removeManifestEntries,
  createMeta,
} from '../lib/manifest-query.js';

const execAsync = promisify(exec);

// Max facts to include in context responses (pinned first, then newest)
const MAX_CONTEXT_FACTS = 50;

/**
 * Fetch project facts for context inclusion.
 * Returns up to MAX_CONTEXT_FACTS entries (pinned first), or empty array on error.
 */
async function fetchProjectFacts(projectId) {
  try {
    const result = await callEzmodoAPI('mcpListFacts', { projectId });
    const facts = result.facts || [];
    return facts.slice(0, MAX_CONTEXT_FACTS);
  } catch {
    return [];
  }
}

// ============================================================================
// get_context — unified context query handler
// ============================================================================

export async function getContext(args) {
  const { entityType, query } = args;

  // Mode 1: keyword search
  if (query) {
    return handleSearch(args);
  }

  // Mode 2: file entity — dependency/related files
  if (entityType === 'file') {
    return handleFileContext(args);
  }

  // Mode 3: project-level context (overview, critical_files, graph_stats, organization)
  // Mode 4: any entity with graph/impact includes
  return handleEntityContext(args);
}

// ============================================================================
// Search mode — replaces search_project_context
// ============================================================================

async function handleSearch(args) {
  const startTime = process.hrtime.bigint();
  const {
    projectId,
    query,
    tags,
    limit: maxResults = 20,
    format = 'compact',
  } = args;

  // Determine search mode from params
  const mode = tags && tags.length > 0 ? 'tags' : 'task';

  // Fetch facts in parallel with search
  const factsPromise = fetchProjectFacts(projectId);

  const source = await getManifestSource(projectId);

  // Remote path: delegate to Go API
  if (source.source === 'remote') {
    const apiMode = mode === 'task' ? 'keyword' : mode;
    const result = await callEzmodoAPI('mcpSearchManifest', {
      projectId: source.projectId,
      query,
      mode: apiMode,
      tags: tags || [],
      max_results: maxResults,
    });

    let results = result.results || [];
    let totalMatches = result.count || 0;

    // Semantic fallback: if keyword search returns few results, try vector similarity
    if (results.length < 5 && !tags) {
      try {
        const semanticResult = await callEzmodoAPI('mcpSemanticSearchFiles', {
          projectId: source.projectId,
          query,
          limit: maxResults,
        });
        if (semanticResult.files && semanticResult.files.length > 0) {
          // Merge results, deduplicating by path
          const existingPaths = new Set(results.map(r => r.path));
          const newResults = (semanticResult.files || [])
            .filter(f => !existingPaths.has(f.path))
            .map(f => ({
              path: f.path,
              summary: f.summary || '',
              domain: f.domain || null,
              tags: f.tags || [],
              score: f.score || 0,
              _semantic: true,
            }));
          results = [...results, ...newResults].slice(0, maxResults);
          totalMatches = results.length;
        }
      } catch {
        // Semantic search is best-effort — don't fail the whole request
        // It may not be available if embeddings haven't been generated yet
      }
    }

    const facts = await factsPromise;
    return {
      context: results.map(r => `${r.path}: ${r.summary}`).join('\n'),
      totalMatches,
      returnedCount: results.length,
      topResults: results.slice(0, 5),
      facts,
      _source: 'remote',
      _meta: { projectId: source.projectId },
    };
  }

  // Local path: existing logic (semantic search not available locally — requires TEI server)
  const manifest = source.manifest;
  const limit = Math.min(Math.max(maxResults, 1), 100);
  let scored;

  if (mode === 'tags') {
    const searchTags = tags || query.split(/[\s,]+/).filter(Boolean);
    scored = getContextForTags(manifest, searchTags);
  } else {
    scored = getContextForTask(manifest, query, limit);
  }

  // Apply limit for tag mode (task mode already limits internally)
  if (mode === 'tags') {
    scored = scored.slice(0, limit);
  }

  const entries = scored.map((s) => s.entry);
  const formatted = formatContextForPrompt(entries, { mode: format });
  const facts = await factsPromise;

  return {
    context: formatted,
    totalMatches: mode === 'tags'
      ? getContextForTags(manifest, tags || query.split(/[\s,]+/).filter(Boolean)).length
      : scored.length,
    returnedCount: entries.length,
    topResults: entries.slice(0, 5).map((e) => ({
      path: e.path,
      score: scored.find((s) => s.entry === e)?.score || 0,
      summary: e.summary,
      domain: e.domain || null,
      tags: e.tags,
    })),
    facts,
    _source: 'local',
    _meta: createMeta(manifest, entries.length, startTime),
  };
}

// ============================================================================
// File context mode — replaces get_related_files
// ============================================================================

async function handleFileContext(args) {
  const startTime = process.hrtime.bigint();
  const {
    projectId,
    entityId: filePath,
    depth = 2,
    direction = 'both',
    format = 'compact',
    include,
  } = args;

  // Fetch facts in parallel with file context
  const factsPromise = fetchProjectFacts(projectId);

  const source = await getManifestSource(projectId);

  // Build base result from file dependencies
  let result = {};

  // Remote path
  if (source.source === 'remote') {
    const apiResult = await callEzmodoAPI('mcpGetRelatedFiles', {
      projectId: source.projectId,
      filePath,
      depth,
      direction,
    });
    result = {
      context: (apiResult.files || []).map(f => `${f.path} (${f.relationship}, depth ${f.depth})`).join('\n'),
      sourceFile: filePath,
      related: apiResult.files || [],
      stats: {
        dependencies: (apiResult.files || []).filter(f => f.relationship === 'dependency').length,
        dependents: (apiResult.files || []).filter(f => f.relationship === 'dependent').length,
        transitive: 0,
      },
      _source: 'remote',
      _meta: { projectId: source.projectId, count: apiResult.count || 0 },
    };
  } else {
    // Local path: existing logic
    const manifest = source.manifest;
    const related = getRelatedFiles(manifest, filePath, depth, direction);

    // If no results, suggest similar paths
    if (related.length === 0) {
      const suggestions = suggestSimilarPaths(manifest, filePath);
      if (suggestions.length > 0) {
        return {
          context: `File "${filePath}" not found in the manifest.`,
          related: [],
          suggestions,
          hint: 'The file path was not found. Did you mean one of the suggested paths?',
          _source: 'local',
          _meta: createMeta(manifest, 0, startTime),
        };
      }
      return {
        context: `File "${filePath}" not found in the manifest and no similar paths were found.`,
        related: [],
        _source: 'local',
        _meta: createMeta(manifest, 0, startTime),
      };
    }

    const formatted = formatContextForPrompt(related, { mode: format });

    // Classify relationships for the source file
    const sourceEntry = manifest.entries.find((e) => e.path === filePath);
    const directDeps = new Set(sourceEntry?.dependencies || []);
    const reverseDepsMap = new Map();
    for (const entry of manifest.entries) {
      for (const dep of entry.dependencies) {
        if (!reverseDepsMap.has(dep)) reverseDepsMap.set(dep, []);
        reverseDepsMap.get(dep).push(entry.path);
      }
    }
    const directRevDeps = new Set(reverseDepsMap.get(filePath) || []);

    const classified = related.map((entry) => ({
      path: entry.path,
      relationship: directDeps.has(entry.path) ? 'dependency' :
        directRevDeps.has(entry.path) ? 'dependent' : 'transitive',
      summary: entry.summary,
      domain: entry.domain || null,
    }));

    result = {
      context: formatted,
      sourceFile: filePath,
      related: classified,
      stats: {
        dependencies: classified.filter((r) => r.relationship === 'dependency').length,
        dependents: classified.filter((r) => r.relationship === 'dependent').length,
        transitive: classified.filter((r) => r.relationship === 'transitive').length,
      },
      _source: 'local',
      _meta: createMeta(manifest, related.length, startTime),
    };
  }

  // Add graph/impact overlays if requested
  if (include) {
    if (include.includes('impact')) {
      result.impact = await callEzmodoAPI('mcpAnalyzeImpact', {
        projectId,
        filePath,
        depth: args.depth,
      });
    }
    if (include.includes('graph')) {
      result.graph = await callEzmodoAPI('mcpQueryProjectGraph', {
        projectId,
        queryType: args.queryType || 'context',
        filePath,
        maxDepth: args.depth,
      });
    }
  }

  result.facts = await factsPromise;
  return result;
}

// ============================================================================
// Entity context mode — replaces get_project_overview, get_critical_files,
// get_graph_stats, analyze_project_organization, query_project_graph,
// analyze_impact
// ============================================================================

async function handleEntityContext(args) {
  const {
    projectId,
    entityType = 'project',
    entityId,
    include,
  } = args;

  // Determine default includes based on entityType
  const sections = include || getDefaultIncludes(entityType);

  const results = {};
  const promises = [];

  // Always include project facts (lightweight, always useful)
  promises.push(
    fetchProjectFacts(projectId).then(r => { results.facts = r; })
  );

  // Project-level sections
  if (sections.includes('overview')) {
    promises.push(
      fetchOverview(args).then(r => { results.overview = r; })
    );
  }

  if (sections.includes('critical_files')) {
    promises.push(
      fetchCriticalFiles(args).then(r => { results.critical_files = r; })
    );
  }

  if (sections.includes('graph_stats')) {
    promises.push(
      callEzmodoAPI('mcpGetGraphStats', { projectId })
        .then(r => { results.graph_stats = r; })
        .catch(e => { results.graph_stats = { error: e.message }; })
    );
  }

  if (sections.includes('organization')) {
    promises.push(
      callEzmodoAPI('mcpAnalyzeProjectOrganization', { projectId })
        .then(r => { results.organization = r; })
        .catch(e => { results.organization = { error: e.message }; })
    );
  }

  // Graph query (any entity type)
  if (sections.includes('graph')) {
    const graphParams = {
      projectId,
      queryType: args.queryType || 'context',
      maxDepth: args.depth,
    };
    // Map entityType+entityId to the correct graph param
    if (entityType === 'task') graphParams.taskId = entityId;
    else if (entityType === 'file') graphParams.filePath = entityId;
    else if (entityType === 'tag') graphParams.tagId = entityId;

    promises.push(
      callEzmodoAPI('mcpQueryProjectGraph', graphParams)
        .then(r => { results.graph = r; })
        .catch(e => { results.graph = { error: e.message }; })
    );
  }

  // Impact analysis (any entity type)
  if (sections.includes('impact')) {
    const impactParams = { projectId, depth: args.depth };
    if (entityType === 'file') impactParams.filePath = entityId;

    promises.push(
      callEzmodoAPI('mcpAnalyzeImpact', impactParams)
        .then(r => { results.impact = r; })
        .catch(e => { results.impact = { error: e.message }; })
    );
  }

  await Promise.all(promises);

  return {
    entityType,
    entityId: entityId || projectId,
    ...results,
  };
}

// ============================================================================
// Helper: fetch overview (local/remote aware)
// ============================================================================

async function fetchOverview(args) {
  const startTime = process.hrtime.bigint();
  const { projectId } = args;

  const source = await getManifestSource(projectId);

  if (source.source === 'remote') {
    const params = { projectId: source.projectId };
    const result = await callEzmodoAPI('mcpGetManifestOverview', params);
    return { ...result, _source: 'remote', _meta: { projectId: source.projectId } };
  }

  const manifest = source.manifest;
  const overview = getProjectOverview(manifest, {});

  return {
    ...overview,
    manifest: {
      version: manifest.metadata.version,
      generatedAt: manifest.metadata.generatedAt,
      projectName: manifest.metadata.projectName,
      generator: manifest.metadata.generator,
    },
    _source: 'local',
    _meta: createMeta(manifest, overview.totalFiles, startTime),
  };
}

// ============================================================================
// Helper: fetch critical files (local/remote aware)
// ============================================================================

async function fetchCriticalFiles(args) {
  const startTime = process.hrtime.bigint();
  const { projectId, limit = 50 } = args;

  const source = await getManifestSource(projectId);

  if (source.source === 'remote') {
    const result = await callEzmodoAPI('mcpGetCriticalFiles', {
      projectId: source.projectId,
      limit,
    });
    return {
      criticalFiles: result.files || [],
      totalCritical: result.count || 0,
      _source: 'remote',
      _meta: { projectId: source.projectId },
    };
  }

  const manifest = source.manifest;
  const critical = getCriticalFiles(manifest, {
    threshold: 5,
    limit,
    unenrichedOnly: true,
  });

  return {
    criticalFiles: critical,
    totalCritical: critical.length,
    _source: 'local',
    _meta: createMeta(manifest, critical.length, startTime),
  };
}

// ============================================================================
// resolve_concepts — maps user-facing terms to code locations
// ============================================================================

export async function resolveConcepts(args) {
  const { projectId, terms } = args;

  if (!terms || terms.length === 0) {
    throw new Error('At least one term is required');
  }

  const source = await getManifestSource(projectId);
  const results = {};

  for (const term of terms) {
    const termLower = term.toLowerCase();
    const termResult = {
      term,
      aliasMatches: [],
      contextMatches: [],
    };

    // Check concept aliases in manifest
    if (source.source === 'local' && source.manifest) {
      const aliases = source.manifest.conceptAliases || [];
      for (const alias of aliases) {
        const allNames = [
          alias.alias.toLowerCase(),
          ...(alias.alternateNames || []).map(n => n.toLowerCase()),
        ];
        if (allNames.some(name => name.includes(termLower) || termLower.includes(name))) {
          termResult.aliasMatches.push({
            alias: alias.alias,
            targets: alias.targets,
            description: alias.description,
          });
        }
      }
    }

    // Also search via get_context for broader matching
    try {
      const contextResult = await handleSearch({
        projectId,
        query: term,
        limit: 5,
      });
      termResult.contextMatches = (contextResult.topResults || []).map(r => ({
        path: r.path,
        summary: r.summary,
        domain: r.domain,
        score: r.score,
      }));
    } catch {
      // Best effort
    }

    results[term] = termResult;
  }

  // Build a flat list of all resolved file paths for convenience
  const allPaths = new Set();
  for (const termResult of Object.values(results)) {
    for (const match of termResult.aliasMatches) {
      match.targets.forEach(t => allPaths.add(t));
    }
    for (const match of termResult.contextMatches) {
      allPaths.add(match.path);
    }
  }

  return {
    resolved: results,
    allPaths: [...allPaths],
    totalPaths: allPaths.size,
  };
}

// ============================================================================
// Helper: default includes per entity type
// ============================================================================

function getDefaultIncludes(entityType) {
  switch (entityType) {
  case 'project':
    return ['overview', 'critical_files', 'graph_stats', 'organization'];
  case 'task':
  case 'epic':
    return ['graph'];
  case 'file':
    return ['dependencies', 'impact'];
  case 'tag':
    return ['graph'];
  default:
    return ['overview'];
  }
}

// ============================================================================
// rebuild_manifest (unchanged)
// ============================================================================

export async function rebuildManifest(args) {
  const startTime = process.hrtime.bigint();

  const { mode: rawMode = 'incremental', target_paths: targetPaths } = args;

  // Check if local filesystem is available
  const localManifest = await loadManifest();
  if (!localManifest) {
    // No local filesystem — cannot rebuild remotely
    return {
      success: false,
      error: 'Manifest rebuild requires a local manifest file, and there is none here. ' +
        'The manifest lives in the API: the desktop app generates and uploads full manifests, ' +
        'and manage_task action:"link_commit" plus update_manifest_entries keep it current ' +
        'one commit at a time.',
      _source: 'local-only',
    };
  }

  // Reject "enriched" mode — LLM enrichment is only available via web UI.
  // Fall back to "full" for backwards compatibility.
  const mode = rawMode === 'enriched' ? 'full' : rawMode;

  // Get pre-rebuild stats
  const priorCount = localManifest?.metadata?.entryCount || 0;

  let command;
  if (mode === 'incremental') {
    command = 'npx tsx scripts/context-manifest/update.ts';
  } else {
    command = 'npx tsx scripts/context-manifest/generate.ts';
  }

  if (targetPaths && targetPaths.length > 0) {
    command += ` -- --paths ${targetPaths.join(',')}`;
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 300000, // 5 minutes
    });

    // Reload the manifest after rebuild
    const newManifest = await reloadManifest();
    const newCount = newManifest?.metadata?.entryCount || 0;

    return {
      success: true,
      mode,
      ...(rawMode === 'enriched' && {
        warning: 'LLM enrichment is no longer available via MCP. Fell back to "full" mode. '
          + 'Use get_critical_files + update_manifest_entries for local AI enrichment instead.',
      }),
      previousEntryCount: priorCount,
      newEntryCount: newCount,
      entriesAdded: Math.max(0, newCount - priorCount),
      entriesRemoved: Math.max(0, priorCount - newCount),
      generatedAt: newManifest?.metadata?.generatedAt,
      note: 'The regenerated manifest is local only — it is not uploaded. The API copy is ' +
        'kept current by link_commit and update_manifest_entries; the desktop app uploads full manifests.',
      output: stdout.trim(),
      ...(stderr.trim() && { warnings: stderr.trim() }),
      _source: 'local',
      _meta: createMeta(newManifest, newCount, startTime),
    };
  } catch (err) {
    return {
      success: false,
      mode,
      error: err.message,
      ...(err.stderr && { stderr: err.stderr.trim() }),
      _source: 'local',
      _meta: createMeta(localManifest, 0, startTime),
    };
  }
}

// ============================================================================
// update_manifest_entries
// ============================================================================

/**
 * Write summaries (and deletions) to the project's manifest.
 *
 * The API holds the manifest's only source of truth, so whenever a project can
 * be resolved the write goes there — through apply-changes, which also CREATES
 * entries that do not exist yet (a file a commit just added). A local manifest
 * file, if this repo still has one, gets the same change best-effort so it does
 * not drift from what the agent just wrote. Local-only happens only when no
 * project can be resolved at all.
 */
export async function updateManifestEntriesHandler(args) {
  const startTime = process.hrtime.bigint();

  const { updates = [], deletes = [], project_id: projectIdArg } = args;

  if (updates.length === 0 && deletes.length === 0) {
    throw new Error('No updates provided. Pass an array of {path, summary} objects, or paths in deletes.');
  }

  const projectId = await resolveManifestProjectId(projectIdArg);

  if (projectId) {
    const result = await callEzmodoAPI('mcpApplyManifestChanges', {
      projectId,
      upserts: updates,
      deletes,
    });
    const created = result?.created || [];
    const updated = result?.updated || [];
    const deleted = result?.deleted || [];
    const notFound = result?.notFound || [];
    const localMirror = await mirrorToLocalManifest(projectId, updates, deletes);
    return {
      success: !result?.manifestMissing,
      created,
      updated,
      deleted,
      notFound,
      needsSummary: result?.needsSummary || [],
      updatedCount: created.length + updated.length,
      notFoundCount: notFound.length,
      ...(result?.manifestMissing && {
        warning: 'This project has no manifest yet, so nothing was written. Generate one with the desktop app.',
      }),
      ...(localMirror && { localMirror }),
      _source: 'remote',
      _meta: { projectId },
    };
  }

  // No project to write to — the local file is all there is.
  const source = await getManifestSource();
  const manifest = source.manifest;
  const result = applyToLocalManifest(manifest, updates, deletes);
  const saved = await saveManifest();

  return {
    success: saved,
    updated: result.updated,
    deleted: result.deleted,
    notFound: result.notFound,
    updatedCount: result.updated.length,
    notFoundCount: result.notFound.length,
    timestamp: result.timestamp,
    ...((!saved) && {
      warning: 'Changes applied to in-memory manifest but failed to save to disk.',
    }),
    _source: 'local',
    _meta: createMeta(manifest, result.updated.length, startTime),
  };
}

/**
 * Apply summary updates and deletions to an in-memory local manifest. Updates
 * without a summary are skipped: locally there is nothing to infer defaults
 * from, and the API copy is the one that creates entries.
 */
function applyToLocalManifest(manifest, updates, deletes) {
  const withSummary = updates.filter(update => typeof update.summary === 'string');
  const updateResult = updateManifestEntries(manifest, withSummary);
  const deleteResult = removeManifestEntries(manifest, deletes);
  return {
    updated: updateResult.updated,
    deleted: deleteResult.deleted,
    notFound: [...updateResult.notFound, ...deleteResult.notFound],
    timestamp: updateResult.timestamp,
  };
}

/**
 * Best-effort: mirror a remote write into this repo's local manifest file when
 * one exists for the same project. Returns null when there is no local file.
 */
async function mirrorToLocalManifest(projectId, updates, deletes) {
  try {
    const source = await getManifestSource(projectId);
    if (source.source !== 'local') return null;
    const result = applyToLocalManifest(source.manifest, updates, deletes);
    const saved = await saveManifest();
    return { updated: result.updated.length, deleted: result.deleted.length, saved };
  } catch {
    return null;
  }
}

// ============================================================================
// get_manifest_schema — returns the manifest JSON schema with docs and examples
// ============================================================================

export async function getManifestSchema(args) {
  const { includeExamples = true, language } = args;

  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'ContextManifest',
    description:
      'A structured index of all files in a project, their roles, dependencies, ' +
      'and AI-useful summaries. Used by ezmodo to power context queries, impact ' +
      'analysis, and knowledge graph features.',

    definitions: {
      ManifestMetadata: {
        type: 'object',
        description: 'Metadata about the manifest itself',
        required: ['version', 'generatedAt', 'projectName', 'entryCount', 'generator'],
        properties: {
          version: {
            type: 'string',
            description: 'Schema version (semver). Use "1.0.0"',
            example: '1.0.0',
          },
          generatedAt: {
            type: 'string',
            description: 'ISO 8601 timestamp of when the manifest was generated',
            example: '2026-03-22T12:00:00.000Z',
          },
          projectName: {
            type: 'string',
            description: 'Human-readable project name',
            example: 'my-project',
          },
          entryCount: {
            type: 'integer',
            description: 'Total number of entries in the manifest. Must match entries.length',
          },
          generator: {
            type: 'string',
            description: 'Identifier for the tool that generated this manifest',
            example: 'ai-agent-manifest-generator',
          },
        },
      },
      ManifestEntry: {
        type: 'object',
        description: 'A single file entry in the manifest',
        required: ['path', 'type', 'tags', 'summary', 'dependencies', 'lastAnalyzed'],
        properties: {
          path: {
            type: 'string',
            description:
              'Relative file path from project root. Use forward slashes. ' +
              'Example: "src/services/auth.ts"',
          },
          type: {
            type: 'string',
            enum: ['source', 'config', 'documentation', 'architecture', 'test', 'infrastructure', 'script', 'style', 'asset', 'ci-cd'],
            description:
              'Broad category of the file. Most code files are "source". ' +
              'Test files are "test". Config files (package.json, tsconfig, etc.) are "config".',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Freeform tags for categorization. Include at minimum: the type, ' +
              'the workspace/directory (e.g., "api", "frontend"), and the business domain ' +
              '(e.g., "auth", "billing", "tasks"). Example: ["source", "handler", "auth", "api"]',
          },
          summary: {
            type: 'string',
            description:
              'Concise, AI-useful description of what the file contains and why it matters. ' +
              '1-3 sentences. Should capture intent, not just contents. ' +
              'Example: "HTTP handler for user authentication. Implements login, signup, ' +
              'password reset, and email verification endpoints."',
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Relative paths of OTHER files in this manifest that this file imports/depends on. ' +
              'Only include project-internal dependencies, not external libraries. ' +
              'Each path must match another entry\'s path field exactly.',
          },
          lastAnalyzed: {
            type: 'string',
            description: 'ISO 8601 timestamp of when this entry was analyzed',
          },
          language: {
            type: 'string',
            description:
              'Programming language. Common values: "typescript", "javascript", "go", "python", ' +
              '"rust", "java", "kotlin", "dart", "csharp", "swift", "php", "ruby", "cpp", "c", ' +
              '"scala", "elixir", "haskell", "lua", "zig", "ocaml"',
          },
          layer: {
            type: 'string',
            enum: ['handler', 'service', 'component', 'hook', 'util', 'type', 'config', 'middleware', 'model', 'route', 'context', 'page', 'migration', 'command'],
            description:
              'Architectural layer. "handler" = HTTP handlers/controllers, "service" = business logic, ' +
              '"component" = UI components, "model" = data models, "middleware" = request/response middleware, ' +
              '"type" = type definitions/interfaces, "util" = utilities/helpers, "route" = routing config, ' +
              '"page" = page components, "hook" = state management, "migration" = database migrations',
          },
          domain: {
            type: 'string',
            description:
              'Business domain area. Common values: "auth", "billing", "tasks", "projects", "users", ' +
              '"notifications", "analytics", "search", "settings", "onboarding". ' +
              'Use whatever domain names make sense for your project.',
          },
          exports: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Key exports from this file — function names, class names, type names. ' +
              'Only include public/exported symbols, not internal ones. Max 50.',
          },
          enrichment_method: {
            type: 'string',
            enum: ['static', 'llm'],
            description:
              'How the summary was generated. Use "static" for rule-based/regex analysis, ' +
              '"llm" for AI-generated summaries. Default: "static"',
            default: 'static',
          },
          criticality_score: {
            type: 'number',
            description:
              'Computed importance score from 0 to 1. Higher = more critical. ' +
              'Based on: inbound dependency count, cross-domain impact, key directory location.',
          },
          criticality_signals: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Signals that contributed to the criticality score. ' +
              'Example: ["high_dependency_count:15", "key_directory:services/", "multi_domain:3"]',
          },
        },
      },
    },

    type: 'object',
    required: ['metadata', 'entries'],
    properties: {
      metadata: { $ref: '#/definitions/ManifestMetadata' },
      entries: {
        type: 'array',
        items: { $ref: '#/definitions/ManifestEntry' },
      },
    },
  };

  const result = { schema };

  // Add examples
  if (includeExamples) {
    const lang = language || 'generic';
    result.examples = generateExamples(lang);
  }

  // Add agent prompt template
  result.agentPrompt = generateAgentPrompt(language);

  // Add supported languages info
  result.supportedLanguages = {
    native: [
      'typescript', 'javascript', 'go', 'python', 'rust', 'java', 'kotlin',
      'dart', 'csharp', 'swift', 'php', 'ruby', 'cpp', 'c',
    ],
    note:
      'These languages are parsed automatically by the built-in manifest generator. ' +
      'For any other language, use this schema to generate a valid manifest yourself.',
  };

  return result;
}

function generateExamples(language) {
  // Base examples that work for any language
  const examples = {
    handler: {
      path: 'src/handlers/auth.ext',
      type: 'source',
      tags: ['source', 'handler', 'auth'],
      summary: 'HTTP handler for authentication. Implements login, signup, and password reset endpoints.',
      dependencies: ['src/services/auth_service.ext', 'src/models/user.ext', 'src/middleware/jwt.ext'],
      lastAnalyzed: new Date().toISOString(),
      language: language === 'generic' ? 'your-language' : language,
      layer: 'handler',
      domain: 'auth',
      exports: ['handleLogin', 'handleSignup', 'handlePasswordReset'],
      enrichment_method: 'static',
    },
    service: {
      path: 'src/services/auth_service.ext',
      type: 'source',
      tags: ['source', 'service', 'auth'],
      summary: 'Core authentication business logic. Manages user sessions, password hashing, and token generation.',
      dependencies: ['src/models/user.ext', 'src/db/repository.ext'],
      lastAnalyzed: new Date().toISOString(),
      language: language === 'generic' ? 'your-language' : language,
      layer: 'service',
      domain: 'auth',
      exports: ['AuthService', 'createSession', 'validateToken'],
      enrichment_method: 'static',
    },
    model: {
      path: 'src/models/user.ext',
      type: 'source',
      tags: ['source', 'model', 'auth'],
      summary: 'User data model. Defines user entity with profile fields, authentication methods, and role permissions.',
      dependencies: [],
      lastAnalyzed: new Date().toISOString(),
      language: language === 'generic' ? 'your-language' : language,
      layer: 'model',
      domain: 'auth',
      exports: ['User', 'UserRole'],
      enrichment_method: 'static',
    },
    test: {
      path: 'tests/auth_test.ext',
      type: 'test',
      tags: ['test', 'unit-test', 'auth'],
      summary: 'Unit tests for authentication service. Covers login flow, token validation, and error cases.',
      dependencies: ['src/services/auth_service.ext', 'src/models/user.ext'],
      lastAnalyzed: new Date().toISOString(),
      language: language === 'generic' ? 'your-language' : language,
      domain: 'auth',
      enrichment_method: 'static',
    },
    config: {
      path: 'config/app.ext',
      type: 'config',
      tags: ['config'],
      summary: 'Application configuration. Database connection, server port, feature flags.',
      dependencies: [],
      lastAnalyzed: new Date().toISOString(),
      enrichment_method: 'static',
    },
  };

  // Language-specific file extensions
  const extMap = {
    scala: '.scala', elixir: '.ex', haskell: '.hs', lua: '.lua',
    zig: '.zig', ocaml: '.ml', r: '.R', perl: '.pl',
    generic: '.ext',
  };
  const ext = extMap[language] || `.${language}` || '.ext';

  // Replace .ext with actual extension
  for (const [_key, example] of Object.entries(examples)) {
    example.path = example.path.replace(/\.ext/g, ext);
    if (example.dependencies) {
      example.dependencies = example.dependencies.map(d => d.replace(/\.ext/g, ext));
    }
  }

  return examples;
}

function generateAgentPrompt(language) {
  const lang = language ? language.charAt(0).toUpperCase() + language.slice(1) : '[LANGUAGE]';

  return {
    template:
      `You are generating a context manifest for a ${lang} project.\n\n` +
      'Walk the project directory and for each source file:\n' +
      '1. Determine its type (source, test, config, documentation, etc.)\n' +
      '2. Detect its programming language\n' +
      '3. Identify its architectural layer (handler, service, model, etc.)\n' +
      '4. Identify its business domain (auth, billing, tasks, etc.)\n' +
      '5. Parse its import/use/require statements to find dependencies on OTHER project files\n' +
      '6. Extract key exports (public functions, classes, types)\n' +
      '7. Write a concise 1-3 sentence summary of what the file does and why it exists\n\n' +
      'IMPORTANT rules for dependencies:\n' +
      '- Only include paths to OTHER files that exist in this project\n' +
      '- Skip external library/framework imports\n' +
      '- Each dependency path must exactly match another entry\'s path field\n' +
      '- Use forward slashes and relative paths from project root\n\n' +
      'Output the result as a JSON object matching the ContextManifest schema.\n' +
      'Set metadata.generator to "ai-agent" and metadata.version to "1.0.0".\n' +
      'Set enrichment_method to "llm" since you are generating the summaries.\n\n' +
      'After generating, call validate_manifest to check for errors before uploading.',
    usage:
      'Pass this prompt to your AI agent along with the schema from get_manifest_schema. ' +
      'The agent should walk the project, build the manifest, validate it, then upload ' +
      'via update_manifest_entries or rebuild_manifest.',
  };
}

// ============================================================================
// validate_manifest — validates a manifest against the schema
// ============================================================================

export async function validateManifest(args) {
  const { manifest } = args;

  const errors = [];
  const warnings = [];

  // Check top-level structure
  if (!manifest) {
    errors.push({ field: 'manifest', message: 'Manifest object is required' });
    return { valid: false, errors, warnings };
  }

  if (!manifest.metadata) {
    errors.push({ field: 'metadata', message: 'metadata object is required' });
  } else {
    // Validate metadata fields
    const meta = manifest.metadata;
    if (!meta.version) errors.push({ field: 'metadata.version', message: 'version is required' });
    if (!meta.generatedAt) errors.push({ field: 'metadata.generatedAt', message: 'generatedAt is required' });
    if (!meta.projectName) errors.push({ field: 'metadata.projectName', message: 'projectName is required' });
    if (meta.entryCount === undefined) errors.push({ field: 'metadata.entryCount', message: 'entryCount is required' });
    if (!meta.generator) errors.push({ field: 'metadata.generator', message: 'generator is required' });
  }

  if (!manifest.entries || !Array.isArray(manifest.entries)) {
    errors.push({ field: 'entries', message: 'entries array is required' });
    return { valid: errors.length === 0, errors, warnings };
  }

  // Check entry count matches
  if (manifest.metadata && manifest.metadata.entryCount !== manifest.entries.length) {
    warnings.push({
      field: 'metadata.entryCount',
      message: `entryCount (${manifest.metadata.entryCount}) does not match entries.length (${manifest.entries.length})`,
    });
  }

  // Valid enum values
  const validTypes = new Set(['source', 'config', 'documentation', 'architecture', 'test', 'infrastructure', 'script', 'style', 'asset', 'ci-cd']);
  const validLayers = new Set(['handler', 'service', 'component', 'hook', 'util', 'type', 'config', 'middleware', 'model', 'route', 'context', 'page', 'migration', 'command']);
  const validEnrichmentMethods = new Set(['static', 'llm']);

  // Build path set for dependency validation
  const allPaths = new Set(manifest.entries.map(e => e.path));

  // Validate each entry
  for (let i = 0; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i];
    const prefix = `entries[${i}]`;

    // Required fields
    if (!entry.path) errors.push({ field: `${prefix}.path`, message: 'path is required' });
    if (!entry.type) errors.push({ field: `${prefix}.type`, message: 'type is required' });
    if (!entry.tags || !Array.isArray(entry.tags)) errors.push({ field: `${prefix}.tags`, message: 'tags array is required' });
    if (!entry.summary) errors.push({ field: `${prefix}.summary`, message: 'summary is required' });
    if (!entry.dependencies || !Array.isArray(entry.dependencies)) {
      errors.push({ field: `${prefix}.dependencies`, message: 'dependencies array is required' });
    }
    if (!entry.lastAnalyzed) errors.push({ field: `${prefix}.lastAnalyzed`, message: 'lastAnalyzed is required' });

    // Enum validation
    if (entry.type && !validTypes.has(entry.type)) {
      warnings.push({ field: `${prefix}.type`, message: `Unknown type "${entry.type}". Valid: ${[...validTypes].join(', ')}` });
    }
    if (entry.layer && !validLayers.has(entry.layer)) {
      warnings.push({ field: `${prefix}.layer`, message: `Unknown layer "${entry.layer}". Valid: ${[...validLayers].join(', ')}` });
    }
    if (entry.enrichment_method && !validEnrichmentMethods.has(entry.enrichment_method)) {
      warnings.push({ field: `${prefix}.enrichment_method`, message: `Unknown enrichment_method "${entry.enrichment_method}". Valid: static, llm` });
    }

    // Dependency path validation (check first 5 broken deps per entry to avoid noise)
    if (entry.dependencies && Array.isArray(entry.dependencies)) {
      let brokenCount = 0;
      for (const dep of entry.dependencies) {
        if (!allPaths.has(dep)) {
          if (brokenCount < 5) {
            warnings.push({ field: `${prefix}.dependencies`, message: `Dependency "${dep}" not found in manifest entries` });
          }
          brokenCount++;
        }
      }
      if (brokenCount > 5) {
        warnings.push({ field: `${prefix}.dependencies`, message: `...and ${brokenCount - 5} more broken dependencies` });
      }
    }

    // Path validation
    if (entry.path && entry.path.includes('\\')) {
      warnings.push({ field: `${prefix}.path`, message: 'Path contains backslashes. Use forward slashes.' });
    }
    if (entry.path && entry.path.startsWith('/')) {
      warnings.push({ field: `${prefix}.path`, message: 'Path is absolute. Use relative paths from project root.' });
    }

    // Summary quality
    if (entry.summary && entry.summary.length < 10) {
      warnings.push({ field: `${prefix}.summary`, message: 'Summary is very short. Aim for 1-3 sentences describing intent.' });
    }

    // Criticality score range
    if (entry.criticality_score !== undefined && (entry.criticality_score < 0 || entry.criticality_score > 1)) {
      warnings.push({ field: `${prefix}.criticality_score`, message: 'criticality_score should be between 0 and 1' });
    }

    // Stop after 50 errors to avoid massive output
    if (errors.length > 50) {
      errors.push({ field: 'manifest', message: 'Validation stopped after 50 errors. Fix these first.' });
      break;
    }
  }

  // Check for duplicate paths
  const pathCounts = {};
  for (const entry of manifest.entries) {
    if (entry.path) {
      pathCounts[entry.path] = (pathCounts[entry.path] || 0) + 1;
    }
  }
  for (const [path, count] of Object.entries(pathCounts)) {
    if (count > 1) {
      errors.push({ field: 'entries', message: `Duplicate path: "${path}" appears ${count} times` });
    }
  }

  return {
    valid: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    summary: errors.length === 0
      ? `Manifest is valid. ${manifest.entries.length} entries, ${warnings.length} warnings.`
      : `Manifest has ${errors.length} errors and ${warnings.length} warnings.`,
  };
}
