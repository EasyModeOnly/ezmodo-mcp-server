import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { listNotes, getNote, manageNote, manageNoteFolder } = await import('../handlers/notes.js');
const { NOTE_TOOLS } = await import('../tools/notes.js');
const { TOOLS } = await import('../tools/index.js');
const { HANDLERS } = await import('../handlers/index.js');
const { READ_ONLY_TOOLS } = await import('../lib/tool-annotations.js');

describe('note tools registration', () => {
  const names = ['list_notes', 'get_note', 'manage_note', 'manage_note_folder'];

  it.each(names)('registers %s with a tool definition and a handler', (name) => {
    expect(TOOLS.some((t) => t.name === name)).toBe(true);
    expect(typeof HANDLERS[name]).toBe('function');
  });

  it('marks only the reads as read-only', () => {
    expect(READ_ONLY_TOOLS.has('list_notes')).toBe(true);
    expect(READ_ONLY_TOOLS.has('get_note')).toBe(true);
    expect(READ_ONLY_TOOLS.has('manage_note')).toBe(false);
    expect(READ_ONLY_TOOLS.has('manage_note_folder')).toBe(false);
  });

  it('tells the agent notes are private and markdown', () => {
    const manage = NOTE_TOOLS.find((t) => t.name === 'manage_note');
    expect(manage.description).toMatch(/PRIVATE/);
    expect(manage.description).toMatch(/markdown/i);
    expect(manage.description).toMatch(/promote/i);
  });

  it('tells the agent when content replacement is refused and what to use instead', () => {
    const get = NOTE_TOOLS.find((t) => t.name === 'get_note');
    expect(get.description).toMatch(/markdownLossless/);
    expect(get.description).toMatch(/append/);

    const { content, append } = NOTE_TOOLS.find((t) => t.name === 'manage_note').inputSchema.properties;
    expect(content.description).toMatch(/note_not_markdown_safe/);
    expect(content.description).toMatch(/markdownLossless/);
    expect(content.description).toMatch(/use append instead/);
    expect(append.description).toMatch(/not markdown-safe/);
  });
});

describe('note handlers', () => {
  afterEach(() => jest.clearAllMocks());

  describe('listNotes / getNote', () => {
    it('passes list filters through as query params', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ notes: [], total: 0 });
      const args = { folderId: 'root', query: 'idea', limit: 5 };
      await listNotes(args);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListNotes', args);
    });

    it('lists with no args', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ notes: [], total: 0 });
      await listNotes(undefined);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListNotes', {});
    });

    it('gets a note by id', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'n-1', content: '# Hi' });
      const result = await getNote({ noteId: 'n-1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetNote', { noteId: 'n-1' });
      expect(result.content).toBe('# Hi');
    });

    it('surfaces a 404', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Note not found', 404));
      await expect(getNote({ noteId: 'nope' })).rejects.toThrow('Note not found');
    });
  });

  describe('manage_note', () => {
    it('creates a note with markdown content in a folder', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'n-1' });
      await manageNote({ action: 'create', title: 'T', content: '- a', folderId: 'f-1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateNote', {
        title: 'T', content: '- a', folderId: 'f-1',
      });
    });

    it('creates at root when folderId is "root"', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'n-1' });
      await manageNote({ action: 'create', title: 'T', folderId: 'root' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateNote', { title: 'T' });
    });

    it('requires a title to create', async () => {
      await expect(manageNote({ action: 'create' })).rejects.toThrow('title is required');
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('updates with append and ignores promote-only fields', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'n-1' });
      await manageNote({ action: 'update', noteId: 'n-1', append: 'more', kind: 'task' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateNote', {
        noteId: 'n-1', append: 'more',
      });
    });

    it('maps folderId "root" to "" on update', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'n-1' });
      await manageNote({ action: 'update', noteId: 'n-1', folderId: 'root' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateNote', {
        noteId: 'n-1', folderId: '',
      });
    });

    it('surfaces the markdown-safety refusal with its message and code', async () => {
      const message = 'This note contains formatting markdown can\'t represent ' +
        '(e.g. underline, @mentions). Use `append` to add content, or edit it in the web app.';
      const refusal = createMockError(message, 409);
      refusal.code = 'note_not_markdown_safe';
      mockCallEzmodoAPI.mockRejectedValueOnce(refusal);

      const call = manageNote({ action: 'update', noteId: 'n-1', content: '# rewritten' });
      await expect(call).rejects.toMatchObject({
        message, status: 409, code: 'note_not_markdown_safe',
      });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateNote', {
        noteId: 'n-1', content: '# rewritten',
      });
    });

    it('rejects an update with nothing to change', async () => {
      await expect(manageNote({ action: 'update', noteId: 'n-1' })).rejects.toThrow('No updates provided');
    });

    it('moves a note to root through the update route', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'n-1', folderId: null });
      await manageNote({ action: 'move', noteId: 'n-1', folderId: 'root' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateNote', { noteId: 'n-1', folderId: '' });
    });

    it('moves a note into a folder', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'n-1', folderId: 'f-2' });
      await manageNote({ action: 'move', noteId: 'n-1', folderId: 'f-2' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateNote', { noteId: 'n-1', folderId: 'f-2' });
    });

    it('requires a folderId to move', async () => {
      await expect(manageNote({ action: 'move', noteId: 'n-1' })).rejects.toThrow('folderId is required');
    });

    it('pins by default and unpins with isPinned:false', async () => {
      mockCallEzmodoAPI.mockResolvedValue({ id: 'n-1' });
      await manageNote({ action: 'pin', noteId: 'n-1' });
      await manageNote({ action: 'pin', noteId: 'n-1', isPinned: false });
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpUpdateNote', { noteId: 'n-1', isPinned: true });
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpUpdateNote', { noteId: 'n-1', isPinned: false });
    });

    it('deletes and reports what it deleted', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });
      const result = await manageNote({ action: 'delete', noteId: 'n-1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteNote', { noteId: 'n-1' });
      expect(result).toEqual({ deleted: true, noteId: 'n-1' });
    });

    it('promotes a note into a bug in a chosen project', async () => {
      const created = { kind: 'bug', entityType: 'task', id: 't-1', number: 42 };
      mockCallEzmodoAPI.mockResolvedValueOnce(created);
      const result = await manageNote({
        action: 'promote', noteId: 'n-1', kind: 'bug', organizationId: 'o-1',
        projectId: 'p-1', priority: 'high', content: 'ignored',
      });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpPromoteNote', {
        noteId: 'n-1', kind: 'bug', organizationId: 'o-1', projectId: 'p-1', priority: 'high',
      });
      expect(result).toEqual(created);
    });

    it('passes featureId through when promoting to an epic', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ kind: 'epic', entityType: 'epic', id: 'e-1', number: 7 });
      await manageNote({
        action: 'promote', noteId: 'n-1', kind: 'epic', organizationId: 'o-1',
        projectId: 'p-1', featureId: 'f-1',
      });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpPromoteNote', {
        noteId: 'n-1', kind: 'epic', organizationId: 'o-1', projectId: 'p-1', featureId: 'f-1',
      });
    });

    it('declares featureId on manage_note', () => {
      const manage = NOTE_TOOLS.find((t) => t.name === 'manage_note');
      expect(manage.inputSchema.properties.featureId).toBeDefined();
    });

    it.each(['kind', 'organizationId', 'projectId'])('requires %s to promote', async (field) => {
      const args = { action: 'promote', noteId: 'n-1', kind: 'task', organizationId: 'o-1', projectId: 'p-1' };
      delete args[field];
      await expect(manageNote(args)).rejects.toThrow(`${field} is required for promote`);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('surfaces a 403 when promoting into a project the user cannot reach', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Forbidden', 403));
      await expect(manageNote({
        action: 'promote', noteId: 'n-1', kind: 'task', organizationId: 'o-1', projectId: 'p-x',
      })).rejects.toThrow('Forbidden');
    });

    it('rejects an unknown action', async () => {
      await expect(manageNote({ action: 'archive', noteId: 'n-1' })).rejects.toThrow('Unknown action: archive');
    });
  });

  describe('manage_note_folder', () => {
    it('lists folders', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ folders: [] });
      await manageNoteFolder({ action: 'list' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListNoteFolders', {});
    });

    it('creates a nested folder', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'f-2' });
      await manageNoteFolder({ action: 'create', name: 'Ideas', parentId: 'f-1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateNoteFolder', { name: 'Ideas', parentId: 'f-1' });
    });

    it('creates a top-level folder', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'f-2' });
      await manageNoteFolder({ action: 'create', name: 'Ideas' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateNoteFolder', { name: 'Ideas' });
    });

    it('renames a folder', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'f-1', name: 'New' });
      await manageNoteFolder({ action: 'rename', folderId: 'f-1', name: 'New' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateNoteFolder', { folderId: 'f-1', name: 'New' });
    });

    it('moves a folder to the top level with parentId null', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'f-1', parentId: null });
      await manageNoteFolder({ action: 'move', folderId: 'f-1', parentId: 'root' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateNoteFolder', { folderId: 'f-1', parentId: null });
    });

    it('requires parentId to move', async () => {
      await expect(manageNoteFolder({ action: 'move', folderId: 'f-1' })).rejects.toThrow('parentId is required');
    });

    it('surfaces a cycle rejection from the API', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('folder cannot be moved into its own descendant', 400));
      await expect(manageNoteFolder({ action: 'move', folderId: 'f-1', parentId: 'f-3' }))
        .rejects.toThrow('descendant');
    });

    it('deletes a folder', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });
      const result = await manageNoteFolder({ action: 'delete', folderId: 'f-1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteNoteFolder', { folderId: 'f-1' });
      expect(result).toEqual({ deleted: true, folderId: 'f-1' });
    });

    it('requires a name to rename', async () => {
      await expect(manageNoteFolder({ action: 'rename', folderId: 'f-1' })).rejects.toThrow('name is required');
    });
  });
});
