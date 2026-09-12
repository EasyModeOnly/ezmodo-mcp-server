/**
 * Context Manifest Query Engine
 * Port of scripts/context-manifest/query.ts for use in the MCP server.
 * Provides search, related files, project overview, and formatting utilities.
 */

// ============================================================================
// Stop Words
// ============================================================================

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
  'they', 'them', 'this', 'that', 'these', 'those', 'what', 'which',
  'who', 'whom', 'where', 'when', 'why', 'how',
  'and', 'but', 'or', 'nor', 'not', 'no', 'so', 'if', 'then',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up',
  'about', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'out', 'off', 'over', 'under', 'again',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'also', 'new', 'add', 'make', 'get', 'set', 'use',
  'file', 'files', 'code', 'change', 'update', 'create',
]);

// ============================================================================
// getContextForTags
// ============================================================================

/**
 * Returns all manifest entries matching ANY of the given tags.
 * Results sorted by number of matching tags (most relevant first).
 *
 * @param {object} manifest - Parsed context manifest
 * @param {string[]} tags - Tags to search for
 * @returns {Array<{entry: object, score: number}>} Scored entries
 */
export function getContextForTags(manifest, tags) {
  if (!tags || tags.length === 0) return [];

  const lowerTags = tags.map((t) => t.toLowerCase());
  const scored = [];

  for (const entry of manifest.entries) {
    let score = 0;
    for (const entryTag of entry.tags) {
      const lowerEntryTag = entryTag.toLowerCase();
      for (const searchTag of lowerTags) {
        if (lowerEntryTag === searchTag) {
          score += 2;
        } else if (lowerEntryTag.startsWith(searchTag) || searchTag.startsWith(lowerEntryTag)) {
          score += 1;
        }
      }
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

// ============================================================================
// getContextForTask
// ============================================================================

/**
 * Extract keywords from a natural language description.
 * Removes stop words, special chars, and deduplicates.
 */
function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word))
    .filter((word, i, arr) => arr.indexOf(word) === i);
}

/**
 * Score a manifest entry against a set of keywords.
 */
function scoreEntry(entry, keywords) {
  let score = 0;

  for (const keyword of keywords) {
    // Tags: highest weight (3 points)
    for (const tag of entry.tags) {
      if (tag.toLowerCase() === keyword) score += 3;
      else if (tag.toLowerCase().includes(keyword)) score += 1;
    }

    // Domain: high weight (3 points)
    if (entry.domain?.toLowerCase() === keyword) score += 3;

    // Summary: medium weight (2 points)
    if (entry.summary.toLowerCase().includes(keyword)) score += 2;

    // Path: low weight (1 point)
    if (entry.path.toLowerCase().includes(keyword)) score += 1;

    // Exports: medium weight (2 points)
    if (entry.exports) {
      for (const exp of entry.exports) {
        if (exp.toLowerCase().includes(keyword)) {
          score += 2;
          break;
        }
      }
    }
  }

  return score;
}

/**
 * Given a natural language task description, returns the most relevant manifest entries.
 * Uses keyword matching against tags, summaries, paths, and domains.
 *
 * @param {object} manifest - Parsed context manifest
 * @param {string} taskDescription - Natural language description
 * @param {number} limit - Maximum results to return (default 20)
 * @returns {Array<{entry: object, score: number}>} Scored entries
 */
export function getContextForTask(manifest, taskDescription, limit = 20) {
  if (!taskDescription || taskDescription.trim().length === 0) return [];

  const keywords = extractKeywords(taskDescription);
  if (keywords.length === 0) return [];

  const scored = [];

  for (const entry of manifest.entries) {
    const score = scoreEntry(entry, keywords);
    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================================================
// getRelatedFiles
// ============================================================================

/**
 * Returns manifest entries related to a given file via the dependency graph.
 * Includes both direct dependencies and reverse dependencies.
 *
 * @param {object} manifest - Parsed context manifest
 * @param {string} filePath - Relative file path from project root
 * @param {number} depth - How many levels deep to traverse (default 1)
 * @param {string} direction - "both", "forward", or "reverse" (default "both")
 * @returns {object[]} Related manifest entries with relationship info
 */
export function getRelatedFiles(manifest, filePath, depth = 1, direction = 'both') {
  if (!filePath) return [];

  // Build lookup maps
  const entryMap = new Map();
  const reverseDeps = new Map();

  for (const entry of manifest.entries) {
    entryMap.set(entry.path, entry);
    for (const dep of entry.dependencies) {
      if (!reverseDeps.has(dep)) reverseDeps.set(dep, []);
      reverseDeps.get(dep).push(entry.path);
    }
  }

  const sourceEntry = entryMap.get(filePath);
  if (!sourceEntry) return [];

  // BFS to collect related files at each depth level
  const visited = new Set([filePath]);
  let currentLevel = new Set([filePath]);

  for (let d = 0; d < depth; d++) {
    const nextLevel = new Set();

    for (const current of currentLevel) {
      const entry = entryMap.get(current);
      if (!entry) continue;

      // Forward dependencies
      if (direction === 'both' || direction === 'forward') {
        for (const dep of entry.dependencies) {
          if (!visited.has(dep)) {
            visited.add(dep);
            nextLevel.add(dep);
          }
        }
      }

      // Reverse dependencies
      if (direction === 'both' || direction === 'reverse') {
        const revDeps = reverseDeps.get(current) || [];
        for (const revDep of revDeps) {
          if (!visited.has(revDep)) {
            visited.add(revDep);
            nextLevel.add(revDep);
          }
        }
      }
    }

    currentLevel = nextLevel;
  }

  // Remove the source file itself
  visited.delete(filePath);

  // Sort: direct deps first, then reverse deps, then deeper
  const directDeps = new Set(sourceEntry.dependencies);
  const directRevDeps = new Set(reverseDeps.get(filePath) || []);

  return Array.from(visited)
    .map((p) => entryMap.get(p))
    .filter((e) => e !== undefined)
    .sort((a, b) => {
      const aIsDirect = directDeps.has(a.path) ? 1 : 0;
      const bIsDirect = directDeps.has(b.path) ? 1 : 0;
      if (aIsDirect !== bIsDirect) return bIsDirect - aIsDirect;

      const aIsReverse = directRevDeps.has(a.path) ? 1 : 0;
      const bIsReverse = directRevDeps.has(b.path) ? 1 : 0;
      if (aIsReverse !== bIsReverse) return bIsReverse - aIsReverse;

      return a.path.localeCompare(b.path);
    });
}

// ============================================================================
// getProjectOverview
// ============================================================================

/**
 * Aggregate manifest metadata into a high-level project overview.
 * Provides domain breakdown, file counts by type/layer, and key entry points.
 *
 * @param {object} manifest - Parsed context manifest
 * @param {object} options - Optional filters
 * @param {string} options.domain - Filter to a specific domain
 * @param {string} options.layer - Filter to a specific layer
 * @returns {object} Project overview
 */
export function getProjectOverview(manifest, options = {}) {
  const { domain, layer } = options;

  let entries = manifest.entries;

  // Apply filters
  if (domain) {
    entries = entries.filter((e) => e.domain === domain);
  }
  if (layer) {
    entries = entries.filter((e) => e.layer === layer);
  }

  // Aggregate by type
  const byType = {};
  for (const entry of entries) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  }

  // Aggregate by layer
  const byLayer = {};
  for (const entry of entries) {
    if (entry.layer) {
      byLayer[entry.layer] = (byLayer[entry.layer] || 0) + 1;
    }
  }

  // Aggregate by domain
  const byDomain = {};
  for (const entry of entries) {
    if (entry.domain) {
      byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1;
    }
  }

  // Aggregate by language
  const byLanguage = {};
  for (const entry of entries) {
    if (entry.language) {
      byLanguage[entry.language] = (byLanguage[entry.language] || 0) + 1;
    }
  }

  // Find key entry points per domain (handlers, services, pages)
  const entryPoints = {};
  const entryPointLayers = new Set(['handler', 'service', 'page', 'route']);
  for (const entry of entries) {
    if (entry.layer && entryPointLayers.has(entry.layer) && entry.domain) {
      if (!entryPoints[entry.domain]) entryPoints[entry.domain] = [];
      entryPoints[entry.domain].push({
        path: entry.path,
        layer: entry.layer,
        summary: entry.summary,
      });
    }
  }

  // Sort entry points — limit to top 5 per domain
  for (const d of Object.keys(entryPoints)) {
    entryPoints[d] = entryPoints[d].slice(0, 5);
  }

  // Dependency statistics
  let totalDeps = 0;
  let maxDeps = 0;
  let maxDepsFile = null;
  const reverseDeps = {};

  for (const entry of entries) {
    totalDeps += entry.dependencies.length;
    if (entry.dependencies.length > maxDeps) {
      maxDeps = entry.dependencies.length;
      maxDepsFile = entry.path;
    }
    for (const dep of entry.dependencies) {
      reverseDeps[dep] = (reverseDeps[dep] || 0) + 1;
    }
  }

  // Find most-depended-on files
  const mostDependedOn = Object.entries(reverseDeps)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([path, count]) => ({ path, dependedOnBy: count }));

  return {
    totalFiles: entries.length,
    byType,
    byLayer,
    byDomain,
    byLanguage,
    entryPoints,
    dependencyStats: {
      totalRelationships: totalDeps,
      mostDependencies: maxDepsFile ? { path: maxDepsFile, count: maxDeps } : null,
      mostDependedOn,
    },
    ...(domain && { filteredByDomain: domain }),
    ...(layer && { filteredByLayer: layer }),
  };
}

// ============================================================================
// formatContextForPrompt
// ============================================================================

/**
 * Format manifest entries into a prompt-ready context block.
 *
 * @param {object[]} entries - Manifest entries to format
 * @param {object} options - Formatting options
 * @param {"compact"|"detailed"|"structured"} options.mode - Output format (default: "compact")
 * @param {number} options.maxLength - Max output length in chars (0 = unlimited)
 * @param {"type"|"domain"|"none"} options.groupBy - Grouping strategy (default: "none")
 * @returns {string} Formatted context
 */
export function formatContextForPrompt(entries, options = {}) {
  const { mode = 'compact', maxLength = 0, groupBy = 'none' } = options;

  if (entries.length === 0) return 'No relevant context found.';

  let output;

  if (mode === 'structured') {
    output = JSON.stringify(
      entries.map((e) => ({
        path: e.path,
        type: e.type,
        tags: e.tags,
        summary: e.summary,
        dependencies: e.dependencies,
        ...(e.layer && { layer: e.layer }),
        ...(e.domain && { domain: e.domain }),
        ...(e.exports && { exports: e.exports }),
      })),
      null,
      2
    );
  } else if (groupBy !== 'none') {
    output = formatGrouped(entries, mode, groupBy);
  } else {
    output = formatFlat(entries, mode);
  }

  // Apply max length
  if (maxLength > 0 && output.length > maxLength) {
    output = output.substring(0, maxLength - 50) + '\n\n... (truncated, ' + entries.length + ' total entries)';
  }

  return output;
}

function formatFlat(entries, mode) {
  const lines = [];
  lines.push(`## Relevant Context (${entries.length} files)\n`);

  for (const entry of entries) {
    if (mode === 'compact') {
      lines.push(`- **${entry.path}**: ${entry.summary}`);
    } else {
      lines.push(`### ${entry.path}`);
      lines.push(`- **Type**: ${entry.type}`);
      lines.push(`- **Summary**: ${entry.summary}`);
      lines.push(`- **Tags**: ${entry.tags.join(', ')}`);
      if (entry.layer) lines.push(`- **Layer**: ${entry.layer}`);
      if (entry.domain) lines.push(`- **Domain**: ${entry.domain}`);
      if (entry.exports && entry.exports.length > 0) {
        lines.push(`- **Exports**: ${entry.exports.slice(0, 10).join(', ')}`);
      }
      if (entry.dependencies.length > 0) {
        const depList = entry.dependencies.slice(0, 5).join(', ');
        const extra = entry.dependencies.length > 5
          ? ` (+${entry.dependencies.length - 5} more)` : '';
        lines.push(`- **Dependencies**: ${depList}${extra}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatGrouped(entries, mode, groupBy) {
  const groups = new Map();

  for (const entry of entries) {
    const key = groupBy === 'type' ? entry.type : (entry.domain || 'other');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const lines = [];
  lines.push(`## Relevant Context (${entries.length} files)\n`);

  for (const [group, groupEntries] of groups) {
    lines.push(`### ${group} (${groupEntries.length} files)\n`);

    for (const entry of groupEntries) {
      if (mode === 'compact') {
        lines.push(`- **${entry.path}**: ${entry.summary}`);
      } else {
        lines.push(`- **${entry.path}**`);
        lines.push(`  - Summary: ${entry.summary}`);
        lines.push(`  - Tags: ${entry.tags.join(', ')}`);
        if (entry.exports && entry.exports.length > 0) {
          lines.push(`  - Exports: ${entry.exports.slice(0, 10).join(', ')}`);
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// getCriticalFiles
// ============================================================================

/** Default directories that indicate critical/core files */
const KEY_DIRECTORIES = [
  'services/',
  'handlers/',
  'core/',
  'middleware/',
  'contexts/',
  'internal/core/',
  'internal/api/handlers/',
  'internal/api/middleware/',
];

/**
 * Identify critical files that would benefit from LLM-enriched summaries.
 * A file is critical if it has high inbound dependencies, spans multiple
 * domains, or lives in a key directory.
 *
 * @param {object} manifest - Parsed context manifest
 * @param {object} options
 * @param {number} options.threshold - Min inbound deps to qualify (default: 5)
 * @param {number} options.limit - Max files to return (default: 50)
 * @param {boolean} options.unenrichedOnly - Only return files not yet
 *   enriched (default: true)
 * @returns {object[]} Critical file entries with scores and signals
 */
export function getCriticalFiles(manifest, options = {}) {
  const {
    threshold = 5,
    limit = 50,
    unenrichedOnly = true,
  } = options;

  // Build inbound dependency counts
  const inboundCounts = new Map();
  for (const entry of manifest.entries) {
    for (const dep of entry.dependencies) {
      inboundCounts.set(dep, (inboundCounts.get(dep) || 0) + 1);
    }
  }

  // Build domain map — count domains each file touches via its deps
  const entryMap = new Map();
  for (const entry of manifest.entries) {
    entryMap.set(entry.path, entry);
  }

  const results = [];

  for (const entry of manifest.entries) {
    // Skip already-enriched files if requested
    if (unenrichedOnly && entry.enrichment_method === 'llm') continue;

    // Skip non-source files (no point enriching configs, assets, etc.)
    if (entry.type !== 'source') continue;

    const signals = [];
    let rawScore = 0;

    // Signal 1: High inbound dependency count
    const inbound = inboundCounts.get(entry.path) || 0;
    if (inbound >= threshold) {
      signals.push(`high_dependency_count:${inbound}`);
      rawScore += Math.min(inbound / 20, 1);
    }

    // Signal 2: Multi-domain (cross-cutting)
    const domains = new Set();
    if (entry.domain) domains.add(entry.domain);
    for (const dep of entry.dependencies) {
      const depEntry = entryMap.get(dep);
      if (depEntry?.domain) domains.add(depEntry.domain);
    }
    if (domains.size >= 3) {
      signals.push(`multi_domain:${domains.size}`);
      rawScore += 0.3;
    }

    // Signal 3: Key directory
    for (const dir of KEY_DIRECTORIES) {
      if (entry.path.includes(dir)) {
        signals.push(`key_directory:${dir.replace(/\/$/, '')}`);
        rawScore += 0.2;
        break;
      }
    }

    if (signals.length === 0) continue;

    results.push({
      path: entry.path,
      score: Math.min(rawScore, 1),
      signals,
      currentSummary: entry.summary,
      enrichmentMethod: entry.enrichment_method || 'static',
      domain: entry.domain || null,
      layer: entry.layer || null,
      language: entry.language || null,
      inboundDeps: inbound,
      dependencies: entry.dependencies,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Update manifest entries with new enriched summaries.
 * Modifies the manifest in-place (caller must save to disk).
 *
 * @param {object} manifest - Parsed context manifest (will be mutated)
 * @param {Array<{path: string, summary: string}>} updates - Entries to update
 * @returns {object} Summary of what was updated
 */
export function updateManifestEntries(manifest, updates) {
  const entryMap = new Map();
  for (const entry of manifest.entries) {
    entryMap.set(entry.path, entry);
  }

  const updated = [];
  const notFound = [];
  const now = new Date().toISOString();

  for (const update of updates) {
    const entry = entryMap.get(update.path);
    if (!entry) {
      notFound.push(update.path);
      continue;
    }

    entry.summary = update.summary;
    entry.enrichment_method = 'llm';
    entry.lastAnalyzed = now;

    if (update.criticality_score !== undefined) {
      entry.criticality_score = update.criticality_score;
    }
    if (update.criticality_signals) {
      entry.criticality_signals = update.criticality_signals;
    }

    updated.push(update.path);
  }

  return { updated, notFound, timestamp: now };
}

// ============================================================================
// Utility: Suggest similar paths
// ============================================================================

/**
 * Suggest similar file paths when an exact match isn't found.
 * Uses simple substring matching on path segments.
 *
 * @param {object} manifest - Parsed context manifest
 * @param {string} filePath - Path that wasn't found
 * @param {number} limit - Max suggestions (default 5)
 * @returns {string[]} Similar paths
 */
export function suggestSimilarPaths(manifest, filePath, limit = 5) {
  const segments = filePath.toLowerCase().split('/').filter(Boolean);
  const basename = segments[segments.length - 1] || '';

  const scored = [];

  for (const entry of manifest.entries) {
    let score = 0;
    const entryLower = entry.path.toLowerCase();

    // Exact basename match
    if (entryLower.endsWith(basename)) score += 3;

    // Segment overlap
    for (const seg of segments) {
      if (entryLower.includes(seg)) score += 1;
    }

    if (score > 0) {
      scored.push({ path: entry.path, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.path);
}

// ============================================================================
// Utility: Create _meta field
// ============================================================================

/**
 * Create a _meta field for tool responses.
 *
 * @param {object} manifest - Parsed manifest (for version info)
 * @param {number} resultCount - Number of results returned
 * @param {number} startTime - process.hrtime.bigint() start
 * @returns {object} Meta object
 */
export function createMeta(manifest, resultCount, startTime) {
  const elapsed = Number(process.hrtime.bigint() - startTime) / 1_000_000;
  return {
    resultCount,
    durationMs: Math.round(elapsed * 100) / 100,
    manifestVersion: manifest?.metadata?.version || null,
    manifestGeneratedAt: manifest?.metadata?.generatedAt || null,
    totalManifestEntries: manifest?.metadata?.entryCount || 0,
  };
}
