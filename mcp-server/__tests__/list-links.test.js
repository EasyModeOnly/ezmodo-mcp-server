import { jest } from '@jest/globals';

const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { listLinks } = await import('../handlers/links.js');
const { LINK_TOOLS } = await import('../tools/links.js');

/**
 * E-225: list_links was source-direction-only, so "what points AT this task?"
 * was unanswerable — and relates_to is not always stored bidirectionally.
 *
 * The tool speaks outgoing/incoming/both (unambiguous about whose perspective
 * it is); the API's ?direction= speaks source/target/both. The mapping lives in
 * handlers/links.js so agents only ever learn one vocabulary.
 */
describe('list_links direction (E-225)', () => {
  beforeEach(() => mockCallZephlyAPI.mockResolvedValue({ links: [] }));
  afterEach(() => jest.clearAllMocks());

  function lastParams() {
    return mockCallZephlyAPI.mock.calls.at(-1)[1];
  }

  it.each([
    ['outgoing', 'source'],
    ['incoming', 'target'],
    ['both', 'both'],
  ])('maps direction "%s" to the API\'s "%s"', async (toolValue, apiValue) => {
    await listLinks({ sourceType: 'task', sourceId: 't1', direction: toolValue });
    expect(lastParams().direction).toBe(apiValue);
  });

  it('omits direction entirely when not given (API default applies)', async () => {
    await listLinks({ sourceType: 'task', sourceId: 't1' });
    expect(lastParams()).not.toHaveProperty('direction');
  });

  it('forwards includeSuggested only when requested', async () => {
    await listLinks({ sourceType: 'task', sourceId: 't1' });
    expect(lastParams()).not.toHaveProperty('includeSuggested');

    await listLinks({ sourceType: 'task', sourceId: 't1', includeSuggested: true });
    expect(lastParams().includeSuggested).toBe('true');
  });

  it('still forwards the pre-existing filters', async () => {
    await listLinks({
      sourceType: 'task',
      sourceId: 't1',
      linkType: 'blocked_by',
      targetType: 'epic',
      hydrate: true,
    });
    expect(lastParams()).toEqual({
      sourceType: 'task',
      sourceId: 't1',
      linkType: 'blocked_by',
      targetType: 'epic',
      hydrate: 'true',
    });
  });

  it('declares both new params on the tool schema', () => {
    const props = LINK_TOOLS.find((t) => t.name === 'list_links').inputSchema.properties;
    expect(props.direction.enum).toEqual(['outgoing', 'incoming', 'both']);
    expect(props.direction.default).toBe('outgoing');
    expect(props.includeSuggested.type).toBe('boolean');
  });
});
