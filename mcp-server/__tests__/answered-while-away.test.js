import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// E-333 #3831: a new session leads with what people answered on the questions
// this key asked while no agent was there.
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { listQuestions, answeredWhileAway } = await import('../handlers/questions.js');
const { getCurrentProjectContext } = await import('../handlers/git-context.js');

afterEach(() => {
  jest.clearAllMocks();
});

describe('answered while you were away', () => {
  it('list_questions sends unseen only when asked', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ items: [] });
    await listQuestions({ organizationId: 'o1', unseen: true });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListQuestions', { organizationId: 'o1', unseen: 'true' });
    await listQuestions({ organizationId: 'o1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpListQuestions', { organizationId: 'o1' });
  });

  it('answeredWhileAway returns the unseen rows and never throws', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ items: [{ id: 'q1' }] });
    await expect(answeredWhileAway('o1')).resolves.toEqual([{ id: 'q1' }]);
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListQuestions', { organizationId: 'o1', unseen: 'true', limit: 20 });

    mockCallEzmodoAPI.mockRejectedValueOnce(new Error('503'));
    await expect(answeredWhileAway('o1')).resolves.toEqual([]);
    await expect(answeredWhileAway(undefined)).resolves.toEqual([]);
  });

  it('get_current_project_context leads with them, and omits the key when there are none', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ezmodo-away-'));
    await fs.mkdir(path.join(dir, '.ezmodo'));
    await fs.writeFile(path.join(dir, '.ezmodo', 'config.json'), JSON.stringify({
      projectId: 'p1', projectName: 'P', organizationId: 'o1', orgSlug: 'emo',
      lastUpdatedAt: new Date().toISOString(), tags: [],
    }));
    try {
      mockCallEzmodoAPI.mockResolvedValueOnce({ items: [{ id: 'q1', status: 'answered' }] });
      const withAway = await getCurrentProjectContext({ workingDirectory: dir });
      expect(Object.keys(withAway)[0]).toBe('answeredWhileAway');
      expect(withAway.answeredWhileAway).toEqual([{ id: 'q1', status: 'answered' }]);
      expect(withAway.projectId).toBe('p1');

      mockCallEzmodoAPI.mockResolvedValueOnce({ items: [] });
      const none = await getCurrentProjectContext({ workingDirectory: dir });
      expect(none).not.toHaveProperty('answeredWhileAway');
      expect(none.projectId).toBe('p1');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
