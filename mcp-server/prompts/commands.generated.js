/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Extracted from plugins/ezmodo/commands/ by scripts/build-prompts.mjs.
 * Edit the command, then run:
 *
 *   npm run generate:prompts --workspace=@ezmodo/mcp-server
 *
 * __tests__/prompts.test.js fails if this drifts from the commands.
 */

export const COMMAND_PROMPTS = [
  {
    "name": "start",
    "description": "Create an EzModo task for what you are about to build, and start it",
    "argumentHint": "[what you are about to work on]",
    "surfaces": [
      "local",
      "remote"
    ],
    "body": "Start tracked work on: **$ARGUMENTS**\n\nFollow the work-tracking contract in this server's instructions. In short:\n\n1. `get_current_project_context()` — cache the `projectId`, note the components,\n   tags and `terminology`.\n2. `get_context` with a keyword query drawn from the request above. Read what\n   comes back before writing anything: it tells you which files exist, what\n   patterns they follow, and what the change will touch.\n3. `resolve_links` on the paths you expect to change. A component you did not\n   expect means the work is broader than the request sounds.\n4. Create the work:\n   - **Single scope** (a fix, a small feature, a config or docs change) —\n     `manage_task action:\"create\"` with `status:\"in_progress\"`, a description\n     that says why/where/how, steps that name real files, `componentIds` for\n     every component involved, and the right `taskType`.\n   - **Multi scope** (spanning areas, or a large refactor) — `manage_epic\n     action:\"create\"` with its child tasks in the same request, ordered by\n     dependency.\n\nThen report the task number and web URL and begin. Do not edit anything before\nthe task exists — a task created afterwards is a task written from memory.\n\nIf no `.ezmodo/config.json` is found, say so and stop rather than guessing at a\nproject."
  },
  {
    "name": "resume",
    "description": "Load an EzModo task or epic by number and continue where the last session stopped",
    "argumentHint": "<task number, epic number, or id>",
    "surfaces": [
      "local",
      "remote"
    ],
    "body": "Resume: **$ARGUMENTS**\n\nLoad it **directly** — `get_task` (with `taskNumber` + `projectId`, or `taskId`)\nor `get_epic`. Do not search; a number or id is an exact address, and\n`search_tasks` / `search_epics` are for when you have neither.\n\nYou will need the `projectId` from `get_current_project_context()` to resolve a\ntask number.\n\nThen, before doing anything:\n\n1. Read **every** knowledge item. That is where the previous session put its\n   reasoning — root causes, decisions and what they rejected, blockers.\n2. Look for knowledge tagged `progress-checkpoint` for the latest status.\n3. Note which steps are already complete. Do not redo them.\n\nReport back: what the task is, what has been done, what the last session\nlearned that changes how you would approach the rest, and which step you are\npicking up. Then continue from there, following the work-tracking contract in this server's instructions for the rest.\n\nIf the task is already `in_review` or `completed`, say so and ask before\nreopening it."
  },
  {
    "name": "submit",
    "description": "Finish the active EzModo task — steps, knowledge, commit links, then in_review",
    "argumentHint": "[anything to note in the completion summary]",
    "surfaces": [
      "local"
    ],
    "body": "Close out the active task.\n\nHEAD: run `git rev-parse HEAD` and use its output\nRecent commits: run `git log --oneline -5` and use its output\n\nWork through, in order:\n\n1. **Steps** — `toggleSteps` for everything now done. If work happened that no\n   step covered, `addStep` it first rather than leaving it unrecorded. If a step\n   was deliberately not done, leave it open and say why in the notes.\n2. **Knowledge** — `addKnowledge` for anything the next session would have to\n   rediscover: root causes (`fact`), decisions and what they rejected\n   (`decision`), blockers (`fact`). Specific: file paths, function names, exact\n   error messages.\n3. **Commits** — `link_commit` for every commit not yet linked, using the full\n   40-character SHA above. A short SHA is rejected.\n4. **Link suggestions** — check `list_agent_suggestions action:\"link\"` for this\n   task and clear the queue with `resolve_link_suggestions`. Reject with a real\n   reason; leaving them pending is the only wrong outcome.\n5. **Test cases** — only if `autoGenerateTestCases` is true in the project\n   context. 3-6 cases covering happy path, edges and errors.\n6. **Submit** — `manage_task action:\"update\"` with `status:\"in_review\"` and\n   `completionNotes`.\n\nThe notes are the deliverable. They must say what was done, what was verified\nand how, and — explicitly — anything in scope that was **not** done and why.\nA summary that omits the gap is worse than none, because the reviewer trusts it.\n\nDo **not** call `manage_task action:\"complete\"`. A human completes the task.\n\nAnything to include: $ARGUMENTS"
  },
  {
    "name": "untracked",
    "description": "Retroactively capture work already in progress that has no EzModo task",
    "argumentHint": "[what the work was, if the diff does not make it obvious]",
    "surfaces": [
      "local",
      "remote"
    ],
    "body": "Capture the current uncommitted work as a task.\n\nCurrent branch: run `git rev-parse --abbrev-ref HEAD` and use its output\nChanged files: run `git status --porcelain` and use its output\n\nUse `report_untracked_work` with:\n\n- `projectId` from `get_current_project_context()`\n- `title` — concise, describing what was actually done\n- `description` — what and **why**. Do not restate the branch or file list; they\n  are appended automatically as evidence.\n- `changedFiles` — the paths above\n- `branch` — as above\n- `componentIds` — resolve the changed paths with `resolve_links` rather than\n  guessing; untracked work often spans more than one area, which is part of why\n  it went untracked\n- `origin`:\n  - `discovered` — found while working on another task (set `discoveredDuringTaskId`)\n  - `scope-creep` — went beyond the active task's scope (set `discoveredDuringTaskId`)\n  - `rework` — redoing prior work\n  - `untracked` — unplanned standalone work (the default)\n\nIf there is an active task in this session, prefer `discovered` or\n`scope-creep` and link it — the discovery chain is the point of the\nclassification.\n\nThe new task comes back `in_progress` and becomes the active one. Track against\nit for the rest of the work.\n\nExtra context from the user, if any: $ARGUMENTS"
  }
];
