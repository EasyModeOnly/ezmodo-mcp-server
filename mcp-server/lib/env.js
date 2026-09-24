/**
 * Environment-variable accessors. New code should call these helpers rather
 * than reading `process.env.EZMODO_*` directly. Pre-rebrand variable names
 * are no longer read (#2843).
 */

/** Resolve the API key from EZMODO_API_KEY. */
export function getApiKey() {
  return process.env.EZMODO_API_KEY || undefined;
}

/** Resolve an optional API URL override from EZMODO_API_URL. */
export function getApiUrl() {
  return process.env.EZMODO_API_URL || undefined;
}
