import { jest } from '@jest/globals';

const mockCall = jest.fn();
const mockLocalProject = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCall }));
jest.unstable_mockModule('../lib/local-project.js', () => ({ localProjectFor: mockLocalProject }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { resolveRefs } = await import('../handlers/links.js');
const { resolveRefToId, withRefResolved } = await import('../lib/ref-lookup.js');
const { READ_ONLY_TOOLS } = await import('../lib/tool-annotations.js');
const { TOOLS } = await import('../tools/index.js');

beforeEach(() => {
  mockCall.mockReset();
  mockLocalProject.mockReset();
});

describe('resolve_refs', () => {
  it('is a registered, read-only tool', () => {
    expect(TOOLS.some((t) => t.name === 'resolve_refs')).toBe(true);
    expect(READ_ONLY_TOOLS.has('resolve_refs')).toBe(true);
  });

  it('defaults the project to the checkout and counts the results', async () => {
    mockLocalProject.mockResolvedValue('local-project');
    mockCall.mockResolvedValue({
      refs: [
        { ref: 'T:1', resolved: true, id: 't1' },
        { ref: 'T:2', resolved: false, reason: 'not_found' },
      ],
      invalid: [],
    });
    const got = await resolveRefs({ text: 'T:1 and T:2' });
    expect(mockCall).toHaveBeenCalledWith('mcpResolveRefs', {
      text: 'T:1 and T:2', refs: undefined, projectId: 'local-project', organizationId: undefined,
    });
    expect(got.resolvedCount).toBe(1);
    expect(got.unresolvedCount).toBe(1);
  });

  it('keeps an explicit project', async () => {
    mockCall.mockResolvedValue({ refs: [], invalid: ['x'] });
    const got = await resolveRefs({ refs: ['x'], projectId: 'p9' });
    expect(mockLocalProject).not.toHaveBeenCalled();
    expect(mockCall.mock.calls[0][1].projectId).toBe('p9');
    expect(got.invalid).toEqual(['x']);
  });

  it('needs text or refs', async () => {
    await expect(resolveRefs({})).rejects.toThrow(/text and\/or refs/);
  });
});

describe('ref lookup for get_task / get_epic', () => {
  it('turns a task ref into a taskId and drops the number', async () => {
    mockLocalProject.mockResolvedValue('local-project');
    mockCall.mockResolvedValue({ refs: [{ entityType: 'task', resolved: true, id: 'task-42' }], invalid: [] });
    const got = await withRefResolved({ ref: 'T:42', taskNumber: 3 }, 'taskId', 'task');
    expect(got).toEqual({ taskId: 'task-42' });
    expect(mockCall).toHaveBeenCalledWith('mcpResolveRefs', {
      refs: ['T:42'], projectId: 'local-project', organizationId: undefined,
    });
  });

  it('lets an explicit id win and passes args without a ref through', async () => {
    expect(await withRefResolved({ ref: 'T:42', taskId: 'given' }, 'taskId', 'task')).toEqual({ taskId: 'given' });
    expect(await withRefResolved({ taskId: 'x' }, 'taskId', 'task')).toEqual({ taskId: 'x' });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('refuses a ref of another type, an unresolved one, and a non-ref', async () => {
    mockCall.mockResolvedValueOnce({ refs: [{ entityType: 'epic', resolved: true, id: 'e' }], invalid: [] });
    await expect(resolveRefToId('E:1', 'task', { projectId: 'p' })).rejects.toThrow(/names a epic, not a task/);
    mockCall.mockResolvedValueOnce({ refs: [{ entityType: 'task', resolved: false, reason: 'not_found' }], invalid: [] });
    await expect(resolveRefToId('T:9', 'task', { projectId: 'p' })).rejects.toThrow(/not_found/);
    mockCall.mockResolvedValueOnce({ refs: [], invalid: ['nope'] });
    await expect(resolveRefToId('nope', 'task', { projectId: 'p' })).rejects.toThrow(/not a reference/);
  });
});
