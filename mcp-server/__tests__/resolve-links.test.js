import { jest } from '@jest/globals';

const mockCall = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callZephlyAPI: mockCall }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { resolveLinks } = await import('../handlers/links.js');

beforeEach(() => mockCall.mockReset());

describe('resolveLinks', () => {
  it('splits components by confidence and features by ownership (E-258)', async () => {
    mockCall.mockResolvedValue({
      matches: [
        { path: 'a.dart', componentId: 'c1', score: 1 },
        { path: 'b.dart', componentId: 'c2', score: 0.9 },
      ],
      features: [
        { path: 'a.dart', featureId: 'f1', score: 1, ambiguous: false },
        { path: 'r.go', featureId: 'f2', score: 0.8, ambiguous: true },
        { path: 'r.go', featureId: 'f3', score: 0.8, ambiguous: true },
      ],
      unresolved: ['README.md'],
    });

    const got = await resolveLinks({ projectId: 'p1', paths: ['a.dart', 'b.dart', 'r.go', 'README.md'] });

    expect(got.deterministic.map((m) => m.componentId)).toEqual(['c1']);
    expect(got.probable.map((m) => m.componentId)).toEqual(['c2']);
    expect(got.features.owned.map((f) => f.featureId)).toEqual(['f1']);
    expect(got.features.shared.map((f) => f.featureId)).toEqual(['f2', 'f3']);
    expect(got.unmatchedPaths).toEqual(['README.md']);
    expect(got.count).toBe(5);
  });

  it('tolerates an API that returns no features', async () => {
    mockCall.mockResolvedValue({ matches: [], unresolved: ['x'] });
    const got = await resolveLinks({ projectId: 'p1', paths: ['x'] });
    expect(got.features).toEqual({ owned: [], shared: [] });
  });
});
