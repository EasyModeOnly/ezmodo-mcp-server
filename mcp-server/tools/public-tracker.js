/**
 * Public Tracker Tools (#3233)
 * The maintainer side of a project's public issue tracker beyond issues
 * (tools/public-issues.js), the changelog (tools/changelog.js) and roadmap
 * writes (tools/roadmap.js): openness settings, comment moderation,
 * participants, private security reports and the GitHub sync and import.
 *
 * Two tools rather than one per area: get_public_tracker holds every read,
 * so it can be annotated read-only, and manage_public_tracker every change.
 *
 * Deliberately left out (#3219): submit-key identity-secret rotation (it
 * returns a secret), intake PII detection and reporter erasure (privacy
 * actions a person should take), the intake blocklist, creating, changing or
 * deleting a GitHub sync and starting an import (web app only).
 */

export const PUBLIC_TRACKER_TOOLS = [
  {
    name: 'get_public_tracker',
    description: 'Read the maintainer side of a project\'s public issue tracker. Pick one view: ' +
      'settings — how open the project is: level (off: nothing public; intake: no public list, outsiders may ' +
      'submit when submissions are on; issues: published issues are public; open: issues plus tasks, epics and ' +
      'milestones through public views) and the submissions, contributors, indexing, roadmap, changelog and ' +
      'security toggles. Viewer; ' +
      'roadmap — every roadmap card (now, next, later, shipped) with its linked issues and summed votes. Viewer; ' +
      'comments — without number, the moderation queue of outsiders\' comments by state (pending by default; ' +
      'visible, hidden); with number, every comment on that public issue in any state, and whether it is locked. ' +
      'Viewer; ' +
      'participants — the signed-in outsiders who take part, with their trust (participant: comments wait for ' +
      'moderation; trusted: visible at once; blocked: may not comment, vote or submit). Viewer; ' +
      'security_reports — private vulnerability reports. They never become public issues; never repeat their ' +
      'details anywhere public. The reporter\'s name and email are not included. Project admins only; ' +
      'github_syncs — the project\'s two-way GitHub issue sync, if any. Admins only; ' +
      'github_sync_health (syncId) — last event and error, pending and failed outbound pushes, open conflicts and ' +
      'recent events. Admins only; ' +
      'github_import_status — past GitHub issue imports, newest first. Members. ' +
      'Paged views take limit and offset and return total and hasMore.',
    inputSchema: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: [
            'settings', 'roadmap', 'comments', 'participants', 'security_reports',
            'github_syncs', 'github_sync_health', 'github_import_status',
          ],
          description: 'What to read',
        },
        projectId: { type: 'string', description: 'Project ID (required)' },
        number: { type: 'number', description: 'comments only: one public issue\'s comments instead of the queue' },
        state: {
          type: 'string',
          enum: ['pending', 'visible', 'hidden'],
          description: 'comments queue only: which comments (default pending)',
        },
        trust: {
          type: 'string',
          enum: ['participant', 'trusted', 'blocked'],
          description: 'participants only: filter by trust',
        },
        status: {
          type: 'string',
          description: 'security_reports only: comma-separated statuses (new, triaging, converted, rejected); ' +
            'default every status',
        },
        syncId: { type: 'string', description: 'github_sync_health only: the sync id from github_syncs' },
        limit: { type: 'number', description: 'Paged views: page size' },
        offset: { type: 'number', description: 'Paged views: rows to skip' },
      },
      required: ['view', 'projectId'],
    },
  },
  {
    name: 'manage_public_tracker',
    description: 'Moderate and configure a project\'s public issue tracker. Everything here is visible to, or ' +
      'acts on, people OUTSIDE the organization, so confirm with the user before changing what the public sees. ' +
      'Actions: ' +
      'update_settings (level?, submissionsEnabled?, contributorsEnabled?, indexingEnabled?, roadmapEnabled?, ' +
      'changelogEnabled?, securityEnabled?, securityPolicy?, securityContact?) — only the fields you send change. ' +
      'RAISING THE LEVEL, OR SWITCHING ON THE ROADMAP OR CHANGELOG AT LEVEL issues OR open, MAKES THEM PUBLIC AT ' +
      'ONCE. Project admins only; ' +
      'reply (number, body) — a maintainer comment on a public issue, visible publicly at once (and mirrored to ' +
      'GitHub when the project syncs). Members; ' +
      'approve_comment / hide_comment (commentId) — publish or hide an outsider\'s comment from the queue. Members; ' +
      'block_author (commentId) — block that comment\'s author on this project (no more comments, votes or ' +
      'submissions) and hide every comment they still have waiting; returns how many were hidden. Members; ' +
      'lock_issue / unlock_issue (number) — stop or allow new outsider comments on an issue. Members; ' +
      'set_trust (userId, trust) — participant, trusted or blocked, including unblocking. Project admins only; ' +
      'set_security_report_status (feedbackId, status, reason?, taskId?) — triaging; converted (taskId: a task in ' +
      'this project that tracks the fix); or rejected (reason required, AND EMAILED TO THE REPORTER, so word it ' +
      'for them). Project admins only; ' +
      'resolve_sync_conflict (syncId, conflictId) — mark a GitHub sync conflict as looked at; it changes neither ' +
      'side, so fix the issue first. Project admins only.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'update_settings', 'reply', 'approve_comment', 'hide_comment', 'block_author',
            'lock_issue', 'unlock_issue', 'set_trust', 'set_security_report_status', 'resolve_sync_conflict',
          ],
          description: 'Action to perform',
        },
        projectId: { type: 'string', description: 'Project ID (required)' },
        level: {
          type: 'string',
          enum: ['off', 'intake', 'issues', 'open'],
          description: 'update_settings: how open the project is',
        },
        submissionsEnabled: { type: 'boolean', description: 'update_settings: outsiders may submit reports' },
        contributorsEnabled: {
          type: 'boolean',
          description: 'update_settings: signed-in outsiders may comment and vote',
        },
        indexingEnabled: {
          type: 'boolean',
          description: 'update_settings: let search engines index the public pages',
        },
        roadmapEnabled: {
          type: 'boolean',
          description: 'update_settings: show the public roadmap (at level issues or open)',
        },
        changelogEnabled: {
          type: 'boolean',
          description: 'update_settings: show the public changelog (at level issues or open)',
        },
        securityEnabled: {
          type: 'boolean',
          description: 'update_settings: publish the security page and its private report form (any level but off)',
        },
        securityPolicy: { type: 'string', description: 'update_settings: public security policy (markdown)' },
        securityContact: { type: 'string', description: 'update_settings: public security contact' },
        number: { type: 'number', description: 'reply, lock_issue, unlock_issue: the public issue number' },
        body: { type: 'string', description: 'reply only: the comment, in markdown' },
        commentId: { type: 'string', description: 'approve_comment, hide_comment, block_author: comment id' },
        userId: { type: 'string', description: 'set_trust only: the participant\'s userId' },
        trust: {
          type: 'string',
          enum: ['participant', 'trusted', 'blocked'],
          description: 'set_trust only',
        },
        feedbackId: { type: 'string', description: 'set_security_report_status only: the report id' },
        status: {
          type: 'string',
          enum: ['triaging', 'converted', 'rejected'],
          description: 'set_security_report_status only',
        },
        reason: {
          type: 'string',
          description: 'set_security_report_status rejected: why, emailed to the reporter',
        },
        taskId: { type: 'string', description: 'set_security_report_status converted: the task tracking the fix' },
        syncId: { type: 'string', description: 'resolve_sync_conflict only' },
        conflictId: { type: 'string', description: 'resolve_sync_conflict only: from github_sync_health' },
      },
      required: ['action', 'projectId'],
    },
  },
];
