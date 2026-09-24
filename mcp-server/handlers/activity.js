/**
 * Activity Timeline Handler
 * Handles get_project_changes MCP tool calls
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/**
 * Parse a relative duration string (e.g., "7d", "2w") into an ISO date string.
 * Returns the input unchanged if it's already an ISO date.
 */
function parseSinceParam(since) {
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
