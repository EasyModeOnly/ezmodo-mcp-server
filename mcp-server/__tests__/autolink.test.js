import { jest } from '@jest/globals';

const mockCall = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callZephlyAPI: mockCall }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const {
  resolvePathsToComponents,
  previewEntityLinks,
  partitionProposals,
  fetchPendingLinkSuggestions,
  attachSuggestionIds,
} = await import('../lib/autolink.js');

beforeEach(() => mockCall.mockReset());

describe('resolvePathsToComponents', () => {
  it('returns the API matches and misses', async () => {
    mockCall.mockResolvedValue({
      matches: [{ path: 'a.dart', componentId: 'c1', score: 1 }],
      unresolved: ['b.txt'],
    });
    const got = await resolvePathsToComponents({ projectId: 'p1', paths: ['a.dart', 'b.txt'] });
    expect(got.matches).toHaveLength(1);
    expect(got.unresolved).toEqual(['b.txt']);
    expect(mockCall).toHaveBeenCalledWith('mcpResolvePaths', { projectId: 'p1', paths: ['a.dart', 'b.txt'] });
  });

  // An API predating E-225 has no such route. Reporting every path as
  // unresolved is honest — we genuinely could not resolve them — and lets the
  // caller carry on rather than surfacing a 404 it can do nothing about.
  it('degrades to all-unresolved when the endpoint is missing', async () => {
    mockCall.mockRejectedValue(new Error('Unknown endpoint'));
    const got = await resolvePathsToComponents({ projectId: 'p1', paths: ['a.dart'] });
    expect(got.matches).toEqual([]);
    expect(got.unresolved).toEqual(['a.dart']);
  });

  it('short-circuits without calling the API when there is nothing to resolve', async () => {
    expect(await resolvePathsToComponents({ projectId: 'p1', paths: [] })).toEqual({ matches: [], unresolved: [] });
    expect(await resolvePathsToComponents({ paths: ['a.dart'] })).toEqual({ matches: [], unresolved: [] });
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('previewEntityLinks', () => {
  it('forwards the subject and returns proposals', async () => {
    mockCall.mockResolvedValue({ proposals: [{ targetId: 'c1', autoApplies: true }] });
    const got = await previewEntityLinks({
      projectId: 'p1', subjectType: 'task', subjectId: 't1', paths: ['a.dart'],
    });
    expect(got.proposals).toHaveLength(1);
    expect(mockCall.mock.calls[0][0]).toBe('mcpPreviewLinks');
    expect(mockCall.mock.calls[0][1]).toMatchObject({ subjectType: 'task', subjectId: 't1' });
  });

  it('never throws — a preview failure must not fail the surrounding create', async () => {
    mockCall.mockRejectedValue(new Error('boom'));
    await expect(previewEntityLinks({ subjectType: 'task', subjectId: 't1' }))
      .resolves.toEqual({ proposals: [] });
  });

  it('requires a subject', async () => {
    expect(await previewEntityLinks({ projectId: 'p1' })).toEqual({ proposals: [] });
    expect(mockCall).not.toHaveBeenCalled();
  });
});

// The split is what lets a caller say "these are handled" separately from
// "please look at these" — conflating them is how a review queue gets ignored.
describe('partitionProposals', () => {
  it('splits on autoApplies', () => {
    const { autoLinked, linkSuggestions } = partitionProposals([
      { targetType: 'component', targetId: 'c1', autoApplies: true, rule: 'code.path_to_component' },
      { targetType: 'feature', targetId: 'f1', autoApplies: false, rule: 'semantic.feature_match', confidence: 0.7 },
    ]);
    expect(autoLinked).toHaveLength(1);
    expect(autoLinked[0].targetId).toBe('c1');
    expect(linkSuggestions).toHaveLength(1);
    expect(linkSuggestions[0].confidence).toBe(0.7);
  });

  it('handles an empty or absent list', () => {
    expect(partitionProposals()).toEqual({ autoLinked: [], linkSuggestions: [] });
    expect(partitionProposals([])).toEqual({ autoLinked: [], linkSuggestions: [] });
  });
});

// #2297: suggestions used to arrive without the id resolve_link_suggestions
// needs, so agents were told to clear a queue they had no handle on.
describe('fetchPendingLinkSuggestions', () => {
  const row = (id, targetId, rule) => ({
    ID: id,
    TargetEntityType: 'feature',
    TargetEntityID: targetId,
    Action: 'link',
    Confidence: 0.88,
    Payload: { link_type: 'relates_to', rule },
  });

  it('normalises the Go-shaped rows the API returns', async () => {
    mockCall.mockResolvedValue({ suggestions: [row('s1', 'f1', 'code.component_feature')] });

    const got = await fetchPendingLinkSuggestions({ subjectType: 'task', subjectId: 't1' });

    expect(mockCall).toHaveBeenCalledWith('mcpListAgentSuggestions', {
      entityType: 'task', entityId: 't1', action: 'link',
    });
    expect(got).toEqual([{
      suggestionId: 's1',
      targetType: 'feature',
      targetId: 'f1',
      linkType: 'relates_to',
      rule: 'code.component_feature',
      confidence: 0.88,
      evidence: { link_type: 'relates_to', rule: 'code.component_feature' },
    }]);
  });

  it('drops rows without an id — an unresolvable entry is worse than none', async () => {
    mockCall.mockResolvedValue({ suggestions: [{ TargetEntityType: 'feature', TargetEntityID: 'f1' }] });
    expect(await fetchPendingLinkSuggestions({ subjectType: 'task', subjectId: 't1' })).toEqual([]);
  });

  it('degrades to empty when the queue is unavailable', async () => {
    mockCall.mockRejectedValue(new Error('boom'));
    expect(await fetchPendingLinkSuggestions({ subjectType: 'task', subjectId: 't1' })).toEqual([]);
  });

  it('returns nothing without a subject', async () => {
    expect(await fetchPendingLinkSuggestions({})).toEqual([]);
    expect(mockCall).not.toHaveBeenCalled();
  });

  describe('attachSuggestionIds', () => {
    const proposal = (targetId) => ({
      targetType: 'feature', targetId, linkType: 'relates_to', rule: 'code.component_feature',
    });

    it('gives a preview proposal the id of its persisted row', async () => {
      mockCall.mockResolvedValue({ suggestions: [row('s1', 'f1', 'code.component_feature')] });

      const got = await attachSuggestionIds({
        subjectType: 'task', subjectId: 't1', linkSuggestions: [proposal('f1')],
      });

      expect(got.linkSuggestions).toHaveLength(1);
      expect(got.linkSuggestions[0].suggestionId).toBe('s1');
      expect(got.linkSuggestions[0].rule).toBe('code.component_feature');
      expect(got.partial).toBe(false);
    });

    // The real defect behind #2297: the engine's semantic rules land after the
    // preview is taken, so the inline list was not merely id-less but short.
    it('appends queued rows the preview never saw', async () => {
      mockCall.mockResolvedValue({
        suggestions: [row('s1', 'f1', 'code.component_feature'), row('s2', 'f2', 'semantic.feature_match')],
      });

      const got = await attachSuggestionIds({
        subjectType: 'task', subjectId: 't1', linkSuggestions: [proposal('f1')],
      });

      expect(got.linkSuggestions).toHaveLength(2);
      expect(got.linkSuggestions.map((s) => s.suggestionId)).toEqual(['s1', 's2']);
      expect(got.partial).toBe(false);
    });

    it('flags partial when a proposal has no row yet', async () => {
      mockCall.mockResolvedValue({ suggestions: [row('s1', 'f1', 'code.component_feature')] });

      const got = await attachSuggestionIds({
        subjectType: 'task', subjectId: 't1', linkSuggestions: [proposal('f1'), proposal('f9')],
      });

      expect(got.partial).toBe(true);
      expect(got.linkSuggestions.find((s) => s.targetId === 'f9').suggestionId).toBeUndefined();
    });

    it('flags partial when the queue read fails but proposals exist', async () => {
      mockCall.mockRejectedValue(new Error('boom'));

      const got = await attachSuggestionIds({
        subjectType: 'task', subjectId: 't1', linkSuggestions: [proposal('f1')],
      });

      expect(got.partial).toBe(true);
      expect(got.linkSuggestions).toHaveLength(1);
    });
  });
});
