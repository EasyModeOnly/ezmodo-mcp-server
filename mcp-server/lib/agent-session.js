/**
 * The agent session id (#3893).
 *
 * The stdio server is one process per agent session (Claude Code starts it
 * and kills it when the session closes), so a random id minted at startup
 * names that session. It is sent as the default `sessionId` when a question
 * is asked, and on the reads that count as the session checking for answers
 * (list_questions, get_task, manage_question wait). The server matches it
 * against task_questions.asked_by_session, so only the session that asked
 * lights a question's "waiting for your answer" dot in the Inbox.
 *
 * The HTTP entry point (http.js) never starts one: that process serves many
 * people's sessions at once, so a process-wide id would be wrong. There the
 * id is null and nothing is sent.
 */

import { randomUUID } from 'node:crypto';

let sessionId = null;

/** Mints this process's session id. Call once, from the stdio entry point. */
export function startAgentSession() {
  if (!sessionId) sessionId = `mcp-${randomUUID()}`;
  return sessionId;
}

/** This process's session id, or null when none was started (HTTP, tests). */
export function getAgentSessionId() {
  return sessionId;
}

/** Test seam: forget the id. */
export function resetAgentSessionForTests() {
  sessionId = null;
}
