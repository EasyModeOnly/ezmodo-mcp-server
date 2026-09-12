/**
 * Environment-variable accessors with EZMODO_* primary / ZEPHLY_* legacy fallback.
 *
 * During the rebrand transition (epic E-141, Phase 5) both names are accepted.
 * The legacy `ZEPHLY_*` reads emit a one-time deprecation warning per process.
 * New code should call these helpers instead of reading `process.env.ZEPHLY_*`
 * directly.
 */

let warnedLegacyApiKey = false;
let warnedLegacyApiUrl = false;

/** Resolve the API key from EZMODO_API_KEY (preferred) or ZEPHLY_API_KEY (legacy). */
export function getApiKey() {
  if (process.env.EZMODO_API_KEY) {
    return process.env.EZMODO_API_KEY;
  }
  if (process.env.ZEPHLY_API_KEY) {
    if (!warnedLegacyApiKey) {
      console.error(
        '⚠️  ZEPHLY_API_KEY is deprecated and will be removed in a future release. Rename to EZMODO_API_KEY.'
      );
      warnedLegacyApiKey = true;
    }
    return process.env.ZEPHLY_API_KEY;
  }
  return undefined;
}

/** Resolve an optional API URL override from EZMODO_API_URL or ZEPHLY_API_URL. */
export function getApiUrl() {
  if (process.env.EZMODO_API_URL) {
    return process.env.EZMODO_API_URL;
  }
  if (process.env.ZEPHLY_API_URL) {
    if (!warnedLegacyApiUrl) {
      console.error(
        '⚠️  ZEPHLY_API_URL is deprecated and will be removed in a future release. Rename to EZMODO_API_URL.'
      );
      warnedLegacyApiUrl = true;
    }
    return process.env.ZEPHLY_API_URL;
  }
  return undefined;
}
