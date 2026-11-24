/**
 * The one sentence that tells an agent how to cite other work (E-335, T:3928).
 *
 * Shared because three tools write the text refs live in — manage_task,
 * manage_epic and create_tasks — and three copies of a grammar hint drift. The
 * grammar itself is docs/internal/GLOSSARY.md § References; keep this to the
 * canonical form only, since descriptions are paid for on every call.
 */
export const REF_HINT =
  'Cite other work by ref, as plain text (a ref in backticks is not one): T:123 task, E:45 epic, ' +
  'D:12 design, DEC:4 decision, web/T:42 in another project. Never write #123 or E-123. ' +
  'Refs in descriptions become links.';
