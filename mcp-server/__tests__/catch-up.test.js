import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmp;
const mockCallEzmodoAPI = jest.fn();
const mockFindConfigPath = jest.fn(async () => path.join(tmp, '.ezmodo', 'config.json'));
const mockReadConfig = jest.fn(async () => ({ projectId: 'proj-from-config' }));
const mockGetEpicActivity = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCallEzmodoAPI }));
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  findConfigPath: mockFindConfigPath,
  readConfig: mockReadConfig,
}));
jest.unstable_mockModule('../handlers/epics.js', () => ({ getEpicActivity: mockGetEpicActivity }));

const { catchUp } = await import('../handlers/activity.js');
const {
  groupEvents, rankGroups, describeGroup, decodeCursor, encodeCursor,
  INLINE_MAX_EVENTS, LOCAL_MAX_EVENTS, REMOTE_PAGE_EVENTS,
} = await import('../lib/catch-up.js');

const at = (minute) => new Date(Date.UTC(2026, 9, 5, 9, minute)).toISOString();
let seq = 0;
const ev = (over = {}) => ({
  id: `evt-${++seq}`,
  eventType: 'task_updated',
  entityType: 'task',
  entityId: 'task-1',
  entityTitle: 'Fix login',
  actor: { type: 'human', id: 'u1', name: 'Sarah' },
  metadata: { taskNumber: 42 },
  timestamp: at(seq % 59),
  ...over,
});

/** n events, each on its own task, so they group to n items. */
const manyEvents = (n, offset = 0) => Array.from({ length: n }, (_, i) =>
  ev({ id: `e${offset + i}`, entityId: `t${offset + i}`, entityTitle: `Task ${offset + i}`, metadata: { taskNumber: offset + i } }));

const summary = (total) => ({ totalEvents: total, uniqueActors: 3, entityTypeCounts: { task: total }, eventTypeCounts: {} });

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'catch-up-'));
  seq = 0;
});
afterEach(async () => {
  jest.clearAllMocks();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('grouping (E-283 #3180)', () => {
  it('collapses a task\'s events into one item with its status journey in time order', () => {
    const events = [
      ev({ eventType: 'task_status_changed', metadata: { taskNumber: 42, oldStatus: 'in_progress', newStatus: 'in_review' }, timestamp: at(30) }),
      ev({ eventType: 'task_created', timestamp: at(1) }),
      ev({ eventType: 'task_status_changed', metadata: { taskNumber: 42, oldStatus: 'todo', newStatus: 'in_progress' }, timestamp: at(10) }),
      ev({ eventType: 'task_comment_added', actor: { type: 'ai', name: 'Claude' }, timestamp: at(20) }),
      ev({ eventType: 'task_comment_added', timestamp: at(21) }),
    ];
    const [item] = rankGroups(groupEvents(events));
    expect(item.ref).toBe('#42');
    expect(item.events).toBe(5);
    expect(item.line).toContain('#42 “Fix login”');
    expect(item.line).toContain('created');
    expect(item.line).toContain('todo → in_progress → in_review');
    expect(item.line).toContain('2 comments');
    expect(item.line).toContain('Claude (AI)');
  });

  it('keeps the names of edited fields but never their values', () => {
    const big = 'x'.repeat(10000);
    const g = groupEvents([ev({ changes: [{ field: 'description', oldValue: big, newValue: big }] })]);
    const line = describeGroup([...g.values()][0]);
    expect(line).toContain('edited (description)');
    expect(line).not.toContain('xxxx');
  });

  it('ranks a completion above a long comment thread', () => {
    const events = [
      ...Array.from({ length: 20 }, () => ev({ entityId: 'chatty', entityTitle: 'Chatty', eventType: 'task_comment_added' })),
      ev({ entityId: 'done', entityTitle: 'Done', eventType: 'task_completed', metadata: { taskNumber: 7 } }),
    ];
    expect(rankGroups(groupEvents(events)).map((i) => i.entityId)).toEqual(['done', 'chatty']);
  });

  it('elides the middle of a long status journey', () => {
    const statuses = ['todo', 'in_progress', 'blocked', 'in_progress', 'in_review', 'in_progress', 'completed'];
    const events = statuses.slice(1).map((s, i) => ev({
      eventType: 'task_status_changed', metadata: { taskNumber: 1, oldStatus: statuses[i], newStatus: s }, timestamp: at(i + 1),
    }));
    expect(describeGroup([...groupEvents(events).values()][0])).toContain('todo → in_progress → … → in_progress → completed');
  });

  it('round-trips a cursor and rejects one it did not make', () => {
    const state = { p: 'proj', s: 'a', u: 'b', e: '', c: 'evt-9' };
    expect(decodeCursor(encodeCursor(state))).toEqual(state);
    expect(decodeCursor('not-a-cursor')).toBeNull();
  });
});

describe('catch_up', () => {
  it('answers a small window inline, taking the project from the checkout', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ events: manyEvents(3), totalCount: 3, summary: summary(3) });

    const out = await catchUp({ since: '7d' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetProjectChanges', expect.objectContaining({
      projectId: 'proj-from-config', sort: 'asc', limit: 500, includeSummary: true,
    }));
    expect(out.delivery).toBe('inline');
    expect(out.items).toHaveLength(3);
    expect(out.totals).toEqual(expect.objectContaining({ events: 3, people: 3 }));
  });

  it('says so when nothing happened', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ events: [], totalCount: 0, summary: summary(0) });
    const out = await catchUp({ projectId: 'p' });
    expect(out.items).toEqual([]);
    expect(out.message).toMatch(/Nothing happened/);
  });

  it('writes a large window to .ezmodo/catch-up and returns the path and highlights', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ events: manyEvents(500), totalCount: 700, nextCursor: 'e499', summary: summary(700) })
      .mockResolvedValueOnce({ events: manyEvents(200, 500), totalCount: 700 });

    const out = await catchUp({ projectId: 'p' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(2);
    expect(mockCallEzmodoAPI.mock.calls[1][1]).toEqual(expect.objectContaining({ cursor: 'e499', includeSummary: false }));
    expect(out.delivery).toBe('file');
    expect(out.file.path.startsWith(path.join(tmp, '.ezmodo', 'catch-up'))).toBe(true);
    expect(out.file.items).toBe(700);
    expect(out.highlights).toHaveLength(15);
    expect(out.truncated).toBeUndefined();
    const md = await fs.readFile(out.file.path, 'utf-8');
    expect(md).toContain('## Tasks (700)');
    expect(md).toContain('[task:t699]');
  });

  it('stops a local read at LOCAL_MAX_EVENTS and says the file is partial', async () => {
    const pages = LOCAL_MAX_EVENTS / 500;
    mockCallEzmodoAPI.mockResolvedValueOnce({ events: manyEvents(500), nextCursor: 'c0', summary: summary(9999) });
    for (let i = 1; i < pages; i += 1) {
      mockCallEzmodoAPI.mockResolvedValueOnce({ events: manyEvents(500, i * 500), nextCursor: `c${i}` });
    }

    const out = await catchUp({ projectId: 'p' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(pages);
    expect(out.truncated).toEqual({ read: LOCAL_MAX_EVENTS, total: 9999 });
    expect(await fs.readFile(out.file.path, 'utf-8')).toContain('**Partial:**');
  });

  it('pages a large window over the remote connector, with the cursor at the page edge', async () => {
    mockFindConfigPath.mockResolvedValue(null);
    try {
      mockCallEzmodoAPI.mockResolvedValueOnce({ events: manyEvents(500), totalCount: 900, nextCursor: 'e499', summary: summary(900) });

      const first = await catchUp({ projectId: 'p', entityTypes: 'task' });

      expect(first.delivery).toBe('page');
      expect(first.items).toHaveLength(REMOTE_PAGE_EVENTS);
      expect(first.totals.events).toBe(900);
      const state = decodeCursor(first.nextCursor);
      expect(state).toEqual(expect.objectContaining({ p: 'p', e: 'task', c: `e${REMOTE_PAGE_EVENTS - 1}` }));

      mockCallEzmodoAPI.mockResolvedValueOnce({ events: manyEvents(REMOTE_PAGE_EVENTS, 200), nextCursor: 'e399' });
      const second = await catchUp({ cursor: first.nextCursor });

      expect(mockCallEzmodoAPI.mock.calls[1][1]).toEqual(expect.objectContaining({
        projectId: 'p', since: state.s, until: state.u, entityType: 'task', cursor: state.c,
        limit: REMOTE_PAGE_EVENTS, includeSummary: false,
      }));
      expect(second.items[0].entityId).toMatch(/^t(2|3)\d\d$/);
      expect(decodeCursor(second.nextCursor).c).toBe('e399');
    } finally {
      mockFindConfigPath.mockImplementation(async () => path.join(tmp, '.ezmodo', 'config.json'));
    }
  });

  it('gives a window just over the inline limit as one remote page with no cursor', async () => {
    mockFindConfigPath.mockResolvedValue(null);
    try {
      const n = INLINE_MAX_EVENTS + 10; // > inline, < one remote page
      mockCallEzmodoAPI.mockResolvedValueOnce({ events: manyEvents(n), totalCount: n, summary: summary(n) });

      const out = await catchUp({ projectId: 'p' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
      expect(out.delivery).toBe('page');
      expect(out.items).toHaveLength(n);
      expect(out.nextCursor).toBeUndefined();
    } finally {
      mockFindConfigPath.mockImplementation(async () => path.join(tmp, '.ezmodo', 'config.json'));
    }
  });

  it('hands scope "epic" to the epic catch-up', async () => {
    mockGetEpicActivity.mockResolvedValueOnce({ summary: ['Maya finished #3'] });
    const out = await catchUp({ scope: 'epic', epicId: 'ep-1', since: '2026-10-01T00:00:00Z', markSeen: false });
    expect(mockGetEpicActivity).toHaveBeenCalledWith({ epicId: 'ep-1', since: '2026-10-01T00:00:00Z', markSeen: false });
    expect(out).toEqual({ scope: 'epic', summary: ['Maya finished #3'] });
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('refuses an unknown scope and a cursor it did not make', async () => {
    await expect(catchUp({ scope: 'sprint' })).rejects.toThrow(/start date as since/);
    await expect(catchUp({ cursor: 'garbage' })).rejects.toThrow(/cursor/);
  });
});
