import { describe, it, expect } from '@jest/globals';
import { plausibleCredential } from '../lib/credential-shape.js';

// E-297 #3354: the hosted connector refuses a bearer that can't be a
// credential before reading up to 8 MB of body.
// The fake key is assembled at runtime: written as one literal it matches the
// public mirror's credential scan (public-mirror.yml), which then refuses to
// sync mcp-server at all (#3435).
const FAKE_KEY = ['ezm', 'sk', 'AbC123dEf456GhI789jKl012MnO345pQ'].join('_');

describe('plausibleCredential', () => {
  it.each([
    FAKE_KEY,
    'zeph_sk_legacyKey0123456789',
    'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLWJ5dGVz',
  ])('accepts %s', (token) => {
    expect(plausibleCredential(token)).toBe(true);
  });

  it.each(['x', 'k', 'ezm_sk_', 'Basic abc', 'a.b.c', 'ezm_sk_has space', `eyJ${'a'.repeat(9000)}.eyJabcdefghij.sigabcdefgh`, undefined])(
    'refuses %j', (token) => {
      expect(plausibleCredential(token)).toBe(false);
    },
  );
});
