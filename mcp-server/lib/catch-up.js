/**
 * Catch me up, through the user's own agent (E-283 #3180).
 *
 * ezmodo used to answer "catch me up" with a Gemini call it ran and paid for.
 * Bring your own agent: ezmodo hands the agent what happened, and the agent
 * writes the summary. The hard part is volume. A busy project's week is
 * thousands of events, and the raw event (field changes with full old and new
 * values, AI reasoning) is far too heavy to pass through a model wholesale.
 *
 * So the events are GROUPED BY ENTITY and collapsed: a task moved five times
 * becomes one line with its status journey, twelve comments become "12
 * comments". What is left is roughly one line per thing that changed. Then:
 *
 *   - small (<= INLINE_MAX_EVENTS): the lines come back inline;
 *   - large, in a checkout: the lines are written to
 *     `.ezmodo/catch-up/<project>-<since>.md` (gitignored with the rest of
 *     .ezmodo) and the agent gets the path, the counts and the highlights,
 *     and reads the file as far as it needs — the same pattern get_document
 *     and get_design use;
 *   - large, over the remote connector (no filesystem): one page of events at a
 *     time, grouped, with an opaque cursor for the next.
 *
 * Everything is bounded: LOCAL_MAX_EVENTS caps what a local call reads, and a
 * remote call reads one page.
 */

import fs from 'fs/promises';
import path from 'path';
import { findConfigPath } from './local-cache.js';

/** Up to this many events, the grouped lines come back inline. */
export const INLINE_MAX_EVENTS = 150;
/** The API's page cap (eventlog pgMaxQueryLimit). */
export const API_PAGE_SIZE = 500;
/** A local call reads at most this many events into the file (10 pages). */
export const LOCAL_MAX_EVENTS = 5000;
/** A remote call reads one page this big, which groups to at most this many items. */
export const REMOTE_PAGE_EVENTS = 200;
/** How many items the overview names as highlights. */
export const HIGHLIGHTS = 15;
/** Longest status journey kept before the middle is elided. */
const MAX_JOURNEY = 5;

// How much an event type says about what happened, for ordering highlights.
// Completions and blocks are what a person catching up most needs to hear.
const WEIGHT = {
  task_completed: 6, epic_completed: 8, goal_completed: 8, milestone_completed: 8,
  task_deleted: 4, epic_deleted: 5, goal_deleted: 5, milestone_deleted: 5, document_deleted: 3,
  task_created: 3, epic_created: 5, goal_created: 5, milestone_created: 5, document_created: 3,
  task_status_changed: 2, epic_status_changed: 4, milestone_status_changed: 4,
  task_assigned: 2, epic_assigned: 2, task_priority_changed: 2, task_due_date_changed: 1,
  goal_metric_updated: 2, project_member_added: 2, project_member_removed: 2,
};
const BLOCKED_WEIGHT = 5;
const COMMENT_WEIGHT_CAP = 3;

const ENTITY_ORDER = ['goal', 'milestone', 'epic', 'task', 'document', 'project', 'comment', 'system'];
const SECTION = {
  goal: 'Goals', milestone: 'Milestones', epic: 'Epics', task: 'Tasks',
  document: 'Documents', project: 'Project', comment: 'Comments', system: 'Other',
};

/** Who did it, as a person reads it: AI agents are marked so. */
function actorLabel(actor) {
  const name = actor?.name || (actor?.type === 'ai' ? 'an AI agent' : 'someone');
  return actor?.type === 'ai' && actor?.name ? `${name} (AI)` : name;
}

/** "#42" for a task, "Epic #7" style is the caller's business; this is the bare ref. */
function refOf(entityType, metadata) {
  if (entityType === 'task' && metadata?.taskNumber) return `#${metadata.taskNumber}`;
  if (entityType === 'epic' && metadata?.epicNumber) return `#${metadata.epicNumber}`;
  return null;
}

/**
 * Group events by the thing they happened to.
 *
 * Events can arrive in any order; each group keeps its first and last time,
 * the people involved, what happened to it, and the status journey in time
 * order. Field VALUES are dropped on purpose — a description edit carries the
 * whole old and new description — and only the names of changed fields kept.
 *
 * @param {object[]} events  ProjectEvent JSON from the activity endpoint
 * @param {Map} [groups]     existing groups to add to (paging)
 * @returns {Map<string, object>}
 */
export function groupEvents(events, groups = new Map()) {
  const sorted = [...events].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  for (const e of sorted) {
    const type = e.entityType || 'system';
    const key = `${type}:${e.entityId || e.id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        entityType: type,
        entityId: e.entityId || null,
        ref: null,
        title: '',
        first: e.timestamp,
        last: e.timestamp,
        events: 0,
        actors: new Set(),
        happened: {},
        statuses: [],
        comments: 0,
        fields: new Set(),
        weight: 0,
      };
      groups.set(key, g);
    }
    g.events += 1;
    if (String(e.timestamp) < String(g.first)) g.first = e.timestamp;
    if (String(e.timestamp) > String(g.last)) g.last = e.timestamp;
    if (e.entityTitle) g.title = e.entityTitle; // the latest title wins
    g.ref = g.ref || refOf(type, e.metadata);
    g.actors.add(actorLabel(e.actor));

    const et = e.eventType;
    if (et === 'task_comment_added') {
      g.comments += 1;
    } else {
      g.happened[et] = (g.happened[et] || 0) + 1;
    }
    g.weight += WEIGHT[et] || 1;

    const oldStatus = e.metadata?.oldStatus;
    const newStatus = e.metadata?.newStatus;
    if (newStatus) {
      if (g.statuses.length === 0 && oldStatus) g.statuses.push(oldStatus);
      if (g.statuses[g.statuses.length - 1] !== newStatus) g.statuses.push(newStatus);
      if (newStatus === 'blocked') g.weight += BLOCKED_WEIGHT;
    }
    for (const c of e.changes || []) {
      if (c?.field && c.field !== 'status') g.fields.add(c.field);
    }
  }
  return groups;
}

/** Comments add weight, but a long thread must not outrank a completion. */
function score(g) {
  return g.weight - g.comments + Math.min(g.comments, COMMENT_WEIGHT_CAP);
}

function day(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 10);
}

function journey(statuses) {
  if (statuses.length <= MAX_JOURNEY) return statuses.join(' → ');
  return [statuses[0], statuses[1], '…', statuses[statuses.length - 2], statuses[statuses.length - 1]].join(' → ');
}

/** What happened to one thing, in one line. */
export function describeGroup(g) {
  const what = [];
  const h = g.happened;
  const has = (suffix) => Object.keys(h).some((k) => k.endsWith(suffix));
  if (has('_created')) what.push('created');
  if (g.statuses.length > 1) what.push(journey(g.statuses));
  else if (g.statuses.length === 1) what.push(`now ${g.statuses[0]}`);
  if (has('_completed') && g.statuses[g.statuses.length - 1] !== 'completed') what.push('completed');
  if (has('_deleted')) what.push('deleted');
  if (has('_assigned')) what.push('reassigned');
  if (h.task_priority_changed) what.push('priority changed');
  if (h.task_due_date_changed) what.push('due date changed');
  if (h.task_dependency_added || h.task_dependency_removed) what.push('dependencies changed');
  if (h.task_label_added || h.task_label_removed) what.push('tags changed');
  if (h.goal_metric_updated) what.push('metric updated');
  if (h.project_member_added) what.push(`${h.project_member_added} member(s) added`);
  if (h.project_member_removed) what.push(`${h.project_member_removed} member(s) removed`);
  const edits = Object.entries(h)
    .filter(([k]) => k.endsWith('_updated') && k !== 'goal_metric_updated')
    .reduce((n, [, v]) => n + v, 0);
  if (edits) {
    const fields = [...g.fields].slice(0, 4).join(', ');
    what.push(fields ? `edited (${fields})` : edits > 1 ? `edited ${edits}×` : 'edited');
  }
  if (g.comments) what.push(g.comments === 1 ? '1 comment' : `${g.comments} comments`);
  if (what.length === 0) what.push(`${g.events} change${g.events === 1 ? '' : 's'}`);

  const name = [g.ref, g.title ? `“${g.title}”` : g.entityId].filter(Boolean).join(' ');
  const who = [...g.actors].slice(0, 3).join(', ') + (g.actors.size > 3 ? ` +${g.actors.size - 3}` : '');
  const when = day(g.first) === day(g.last) ? day(g.last) : `${day(g.first)}–${day(g.last)}`;
  return `${name}: ${what.join('; ')} — ${who}, ${when}`;
}

/** Groups as plain objects, most significant first. */
export function rankGroups(groups) {
  return [...groups.values()]
    .sort((a, b) => score(b) - score(a) || String(b.last).localeCompare(String(a.last)))
    .map((g) => ({
      entityType: g.entityType,
      entityId: g.entityId,
      ref: g.ref,
      title: g.title,
      line: describeGroup(g),
      events: g.events,
      lastAt: g.last,
    }));
}

/** The whole catch-up as markdown, one section per kind of thing. */
export function renderMarkdown({ projectId, since, until, totals, items, truncated }) {
  const out = [];
  out.push(`# Catch up: project ${projectId}`);
  out.push('');
  out.push(`From ${since} to ${until}. ${totals.events} events on ${items.length} items` +
    (totals.people != null ? ` by ${totals.people} people and agents.` : '.'));
  if (truncated) {
    out.push('');
    out.push(`**Partial:** only the first ${truncated.read} of ${truncated.total} events (oldest first) are below. ` +
      'Ask again with a later `since`, or narrow by `entityTypes`, for the rest.');
  }
  out.push('');
  out.push('Each line: what it is, what happened (status journey in order), who, when. ' +
    'Items within a section are most significant first.');
  const byType = new Map();
  for (const it of items) {
    if (!byType.has(it.entityType)) byType.set(it.entityType, []);
    byType.get(it.entityType).push(it);
  }
  const types = [...byType.keys()].sort((a, b) => {
    const ia = ENTITY_ORDER.indexOf(a); const ib = ENTITY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const t of types) {
    const list = byType.get(t);
    out.push('');
    out.push(`## ${SECTION[t] || t} (${list.length})`);
    out.push('');
    for (const it of list) out.push(`- ${it.line}${it.entityId ? ` [${it.entityType}:${it.entityId}]` : ''}`);
  }
  out.push('');
  return out.join('\n');
}

/** `.ezmodo/catch-up`, or null when this is not a tracked checkout. */
export async function catchUpRoot() {
  const configPath = await findConfigPath();
  return configPath ? path.join(path.dirname(configPath), 'catch-up') : null;
}

const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/**
 * Write the catch-up to `.ezmodo/catch-up/`. Returns { path, bytes }, or null
 * with no `.ezmodo` directory (the remote connector) or when the write fails,
 * so the caller falls back to answering inline.
 */
export async function writeCatchUpFile({ projectId, since }, markdown) {
  const root = await catchUpRoot();
  if (!root) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(root, `${safe(projectId)}-since-${safe(day(since))}-${stamp}.md`);
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(file, markdown, 'utf-8');
  } catch {
    return null;
  }
  return { path: file, bytes: Buffer.byteLength(markdown, 'utf-8') };
}

/** Opaque remote paging cursor: the API's event cursor plus the fixed window. */
export function encodeCursor(state) {
  return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64url');
}

export function decodeCursor(cursor) {
  try {
    const s = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf-8'));
    if (!s || typeof s.c !== 'string' || typeof s.p !== 'string') return null;
    return s;
  } catch {
    return null;
  }
}
