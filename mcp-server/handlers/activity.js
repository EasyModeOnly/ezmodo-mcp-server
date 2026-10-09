/**
 * Activity Timeline Handler
 * Handles get_project_changes and catch_up MCP tool calls
 */

import { callEzmodoAPI } from '../lib/http-client.js';
import { readConfig } from '../lib/local-cache.js';
import {
  API_PAGE_SIZE, HIGHLIGHTS, INLINE_MAX_EVENTS, LOCAL_MAX_EVENTS, REMOTE_PAGE_EVENTS,
  catchUpRoot, decodeCursor, encodeCursor, groupEvents, rankGroups, renderMarkdown, writeCatchUpFile,
} from '../lib/catch-up.js';
import { getEpicActivity } from './epics.js';

/**
 * Parse a relative duration string (e.g., "7d", "2w") into an ISO date string.
 * Returns the input unchanged if it's already an ISO date.
 */
export function parseSinceParam(since) {
  if (!since) {
    // Default: 7 days ago
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }

  // Check for relative duration: Nd, Nw, Nm
  const match = since.match(/^(\d+)([dwm])$/);
  if (match) {
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const d = new Date();
    if (unit === 'd') d.setDate(d.getDate() - n);
    else if (unit === 'w') d.setDate(d.getDate() - n * 7);
    else if (unit === 'm') d.setMonth(d.getMonth() - n);
    return d.toISOString();
  }

  // Assume ISO date
  return since;
}

/**
 * Format an event into a human-readable description for AI agents.
 */
function formatEventDescription(event) {
  const actor = event.actor?.name || 'Someone';
  const title = event.entityTitle || event.entityId;
  const taskNum = event.metadata?.taskNumber ? `#${event.metadata.taskNumber}` : '';
  const epicNum = event.metadata?.epicNumber ? `E-${event.metadata.epicNumber}` : '';
  const entityLabel = taskNum || epicNum || '';
  const titleWithNum = entityLabel ? `${entityLabel} '${title}'` : `'${title}'`;

  switch (event.eventType) {
  case 'task_created': return `${actor} created task ${titleWithNum}`;
  case 'task_completed': return `${actor} completed task ${titleWithNum}`;
  case 'task_status_changed': {
    const newStatus = event.metadata?.newStatus || '';
    return `${actor} moved task ${titleWithNum} to ${newStatus}`;
  }
  case 'task_assigned': return `${actor} assigned task ${titleWithNum}`;
  case 'task_updated': return `${actor} updated task ${titleWithNum}`;
  case 'task_deleted': return `${actor} deleted task ${titleWithNum}`;
  case 'task_comment_added': return `${actor} commented on task ${titleWithNum}`;
  case 'task_priority_changed': return `${actor} changed priority on task ${titleWithNum}`;
  case 'epic_created': return `${actor} created epic ${titleWithNum}`;
  case 'epic_completed': return `${actor} completed epic ${titleWithNum}`;
  case 'epic_status_changed': {
    const newStatus = event.metadata?.newStatus || '';
    return `${actor} moved epic ${titleWithNum} to ${newStatus}`;
  }
  case 'epic_progress_changed': return `Progress changed on epic ${titleWithNum}`;
  case 'goal_created': return `${actor} created goal '${title}'`;
  case 'goal_completed': return `${actor} completed goal '${title}'`;
  case 'milestone_created': return `${actor} created milestone '${title}'`;
  case 'milestone_completed': return `${actor} completed milestone '${title}'`;
  case 'milestone_status_changed': {
    const newStatus = event.metadata?.newStatus || '';
    return `${actor} moved milestone '${title}' to ${newStatus}`;
  }
  case 'milestone_updated': return `${actor} updated milestone '${title}'`;
  case 'milestone_deleted': return `${actor} deleted milestone '${title}'`;
  case 'document_created': return `${actor} created document '${title}'`;
  case 'document_updated': return `${actor} updated document '${title}'`;
  default: return event.description || `${actor} performed ${event.eventType} on ${event.entityType} '${title}'`;
  }
}

export async function getProjectChanges(args) {
  const { projectId, since, entityTypes, eventTypes, limit } = args;

  if (!projectId) {
    throw new Error('projectId is required');
  }

  const params = {
    projectId,
    since: parseSinceParam(since),
    limit: Math.min(limit || 20, 100),
    includeSummary: true,
  };

  if (entityTypes) params.entityType = entityTypes;
  if (eventTypes) params.eventType = eventTypes;

  const result = await callEzmodoAPI('mcpGetProjectChanges', params);

  // Enrich events with human-readable descriptions
  const events = (result.events || []).map(event => ({
    ...event,
    humanDescription: formatEventDescription(event),
  }));

  return {
    summary: result.summary || null,
    totalCount: result.totalCount || 0,
    events,
  };
}

/** The counts the API computes in SQL over the WHOLE window, whatever was read. */
function totalsFrom(page) {
  const s = page.summary || {};
  return {
    events: s.totalEvents ?? page.totalCount ?? 0,
    people: s.uniqueActors ?? null,
    byEntityType: s.entityTypeCounts || {},
    byEventType: s.eventTypeCounts || {},
  };
}

const itemOut = ({ entityType, entityId, ref, title, line }) => ({ entityType, entityId, ref, title, line });

/**
 * One remote page: up to REMOTE_PAGE_EVENTS events from `cursor`, grouped.
 * An item that spans pages appears on each page it has events in.
 */
async function remotePage(state) {
  const page = await callEzmodoAPI('mcpGetProjectChanges', {
    projectId: state.p, since: state.s, until: state.u, sort: 'asc',
    ...(state.e ? { entityType: state.e } : {}),
    cursor: state.c, limit: REMOTE_PAGE_EVENTS, includeSummary: false,
  });
  const items = rankGroups(groupEvents(page.events || [])).map(itemOut);
  return {
    scope: 'project',
    projectId: state.p,
    since: state.s,
    until: state.u,
    delivery: 'page',
    items,
    ...(page.nextCursor ? { nextCursor: encodeCursor({ ...state, c: page.nextCursor }) } : {}),
  };
}

/**
 * Catch me up (E-283 #3180): what happened in a project, grouped by the thing
 * it happened to, for the user's own agent to summarise. See lib/catch-up.js
 * for how the volume is kept out of the model's way.
 */
export async function catchUp(args = {}) {
  const scope = args.scope || 'project';

  if (scope === 'epic') {
    if (!args.epicId) throw new Error('epicId is required for scope "epic"');
    // E-259's epic catch-up already answers "since you last looked", in
    // sentences, with what is waiting on this person first. Not duplicated.
    const result = await getEpicActivity({ epicId: args.epicId, since: args.since, markSeen: args.markSeen });
    return { scope: 'epic', ...result };
  }
  if (scope !== 'project') {
    throw new Error(`scope must be "project" or "epic", not "${scope}". ` +
      'For a sprint, pass its start date as since. For things you watch, use list_notifications.');
  }

  if (args.cursor) {
    const state = decodeCursor(args.cursor);
    if (!state) throw new Error('cursor is not one catch_up returned; call again without it to start over');
    return remotePage(state);
  }

  const projectId = args.projectId || (await readConfig())?.projectId;
  if (!projectId) throw new Error('projectId is required (no .ezmodo/config.json to take it from)');

  const since = parseSinceParam(args.since);
  const until = new Date().toISOString();
  const window = {
    projectId, since, until, sort: 'asc',
    ...(args.entityTypes ? { entityType: args.entityTypes } : {}),
  };

  const first = await callEzmodoAPI('mcpGetProjectChanges', { ...window, limit: API_PAGE_SIZE, includeSummary: true });
  const totals = totalsFrom(first);
  const firstEvents = first.events || [];
  const base = { scope: 'project', projectId, since, until, totals };

  if (totals.events === 0) {
    return { ...base, delivery: 'inline', items: [], message: 'Nothing happened in this project in that window.' };
  }

  // Small enough to just answer.
  if (!first.nextCursor && firstEvents.length <= INLINE_MAX_EVENTS) {
    return { ...base, delivery: 'inline', items: rankGroups(groupEvents(firstEvents)).map(itemOut) };
  }

  // A checkout: read up to LOCAL_MAX_EVENTS into a file the agent reads as it needs.
  if (await catchUpRoot()) {
    const groups = groupEvents(firstEvents);
    let read = firstEvents.length;
    let cursor = first.nextCursor;
    while (cursor && read < LOCAL_MAX_EVENTS) {
      const page = await callEzmodoAPI('mcpGetProjectChanges', {
        ...window, cursor, limit: Math.min(API_PAGE_SIZE, LOCAL_MAX_EVENTS - read), includeSummary: false,
      });
      const events = page.events || [];
      if (events.length === 0) break;
      groupEvents(events, groups);
      read += events.length;
      cursor = page.nextCursor;
    }
    const items = rankGroups(groups);
    const truncated = cursor ? { read, total: totals.events } : null;
    const markdown = renderMarkdown({ projectId, since, until, totals, items, truncated });
    const file = await writeCatchUpFile({ projectId, since }, markdown);
    if (file) {
      return {
        ...base,
        delivery: 'file',
        file: { ...file, items: items.length },
        highlights: items.slice(0, HIGHLIGHTS).map(itemOut),
        ...(truncated ? { truncated } : {}),
        next: `The full catch-up is in ${file.path}: one line per item, grouped by kind (goals, milestones, ` +
          'epics, tasks, documents), most significant first. Read it in chunks as far as you need, then ' +
          'summarise for your person. Drill into an item with get_task / get_epic.',
      };
    }
    // The write failed: fall through and answer by page instead.
  }

  // The remote connector (no filesystem): the first page now, a cursor for the rest.
  const pageEvents = firstEvents.slice(0, REMOTE_PAGE_EVENTS);
  const more = firstEvents.length > REMOTE_PAGE_EVENTS
    ? pageEvents[pageEvents.length - 1].id
    : first.nextCursor;
  return {
    ...base,
    delivery: 'page',
    items: rankGroups(groupEvents(pageEvents)).map(itemOut),
    ...(more ? {
      nextCursor: encodeCursor({ p: projectId, s: since, u: until, e: args.entityTypes || '', c: more }),
      next: 'This is the first page, oldest first. `totals` covers the whole window. Call catch_up again ' +
        'with nextCursor for the next page; an item can appear on more than one page.',
    } : {}),
  };
}
