/**
 * Tool Definitions Index
 * Aggregates all MCP tool definitions
 *
 * Consolidated tool set (~40 tools, down from 116):
 * - One "manage_*" tool per entity (mutations with action param)
 * - One "get_*" or "list_*" tool per entity (reads)
 * - One unified "get_context" tool (replaces 8 context/graph tools)
 */

import { ORGANIZATION_TOOLS } from './organizations.js';
import { PROJECT_TOOLS } from './projects.js';
import { EPIC_TOOLS } from './epics.js';
import { MILESTONE_TOOLS } from './milestones.js';
import { RELEASE_TOOLS } from './releases.js';
import { FEATURE_TOOLS } from './features.js';
import { DECISION_TOOLS } from './decisions.js';
import { DESIGN_TOOLS } from './designs.js';
import { CATALOG_TOOLS } from './catalogs.js';
import { UNMAPPED_PATH_TOOLS } from './unmapped-paths.js';
import { FEATURE_FLAG_TOOLS } from './feature-flags.js';
import { TASK_TOOLS } from './tasks.js';
import { DOCUMENT_TOOLS } from './documents.js';
import { FOLDER_TOOLS } from './folders.js';
import { ATTACHMENT_TOOLS } from './attachments.js';
import { ENTITY_TOOLS } from './entities.js';
import { LINK_TOOLS } from './links.js';
import { ACCESS_TOOLS } from './access.js';
import { GRAPH_TOOLS } from './graph.js';
import { TAG_TOOLS } from './tags.js';
import { WATCHER_TOOLS } from './watchers.js';
import { AI_INTELLIGENCE_TOOLS } from './ai-intelligence.js';
import { GIT_CONTEXT_TOOLS } from './git-context.js';
import { WORKTREE_TOOLS } from '../lib/worktree-tools.js';
import { GITHUB_TOOLS } from './github.js';
import { TODO_TOOLS } from './todos.js';
import { NOTE_TOOLS } from './notes.js';
import { TESTING_TOOLS } from './testing.js';
import { CONTEXT_MANIFEST_TOOLS } from './context-manifest.js';
import { ACTIVITY_TOOLS } from './activity.js';
import { FACT_TOOLS } from './facts.js';
import { AGENT_TOOLS } from './agents.js';
import { RECURRING_TASK_TOOLS } from './recurring-tasks.js';
import { WORK_TEMPLATE_TOOLS } from './work-templates.js';
import { AUTH_TOOLS } from './auth.js';

export const TOOLS = [
  // First in the list on purpose: it is the one tool that works before the
  // server has a credential, so it should be the one an agent notices.
  ...AUTH_TOOLS,
  ...ORGANIZATION_TOOLS,
  ...PROJECT_TOOLS,
  ...EPIC_TOOLS,
  ...MILESTONE_TOOLS,
  ...RELEASE_TOOLS,
  ...FEATURE_TOOLS,
  ...DECISION_TOOLS,
  ...DESIGN_TOOLS,
  ...CATALOG_TOOLS,
  ...UNMAPPED_PATH_TOOLS,
  ...FEATURE_FLAG_TOOLS,
  ...TASK_TOOLS,
  ...RECURRING_TASK_TOOLS,
  ...WORK_TEMPLATE_TOOLS,
  ...DOCUMENT_TOOLS,
  ...FOLDER_TOOLS,
  ...ATTACHMENT_TOOLS,
  ...ENTITY_TOOLS,
  ...LINK_TOOLS,
  ...ACCESS_TOOLS,
  ...GRAPH_TOOLS,
  ...TAG_TOOLS,
  ...WATCHER_TOOLS,
  ...AI_INTELLIGENCE_TOOLS,
  ...GIT_CONTEXT_TOOLS,
  ...WORKTREE_TOOLS,
  ...GITHUB_TOOLS,
  ...TODO_TOOLS,
  ...NOTE_TOOLS,
  ...TESTING_TOOLS,
  ...CONTEXT_MANIFEST_TOOLS,
  ...ACTIVITY_TOOLS,
  ...FACT_TOOLS,
  ...AGENT_TOOLS,
];
