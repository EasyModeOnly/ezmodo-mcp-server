/**
 * Normalize the two ways a caller can name files it touched: the E-225
 * `changedFiles` string array, or the pre-existing `linkedFiles` object array.
 * Explicit input always wins over auto-resolution — the agent knows better than
 * a similarity search what it actually edited.
 *
 * Lives in lib/ rather than in the task handler because the epic-with-tasks
 * create (#2247) needs it too, and a handler importing another handler would
 * drag the whole task-handler dependency set into every epic test.
 */
export function normalizeChangedFiles(changedFiles, linkedFiles) {
  const out = [];
  const seen = new Set();
  for (const f of linkedFiles || []) {
    const path = typeof f === 'string' ? f : f?.path;
    if (path && !seen.has(path)) { seen.add(path); out.push({ path, source: f?.source || 'mcp' }); }
  }
  for (const path of changedFiles || []) {
    if (path && !seen.has(path)) { seen.add(path); out.push({ path, source: 'mcp' }); }
  }
  return out;
}
