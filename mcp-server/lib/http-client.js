/**
 * HTTP Client for EzModo API
 * Handles API requests, encoding, and response unwrapping
 */

import fetch from 'node-fetch';
import zlib from 'zlib';
import { ENDPOINT_MAP } from '../config/endpoint-map.js';
import { CONFIG } from '../config/index.js';
import { MCP_VERSION } from './version.js';
import { getLogger } from './logger.js';
import { getApiUrl } from './env.js';
// Not getApiKey() directly. Two reasons, both about the credential belonging to
// the CALL rather than the process: over HTTP one process serves many callers,
// each with their own key (#2599); and over stdio the credential may be an
// OAuth token this server obtained for itself, which can need refreshing before
// use (#2631). lib/credentials.js owns the precedence between them.
import { resolveCredential } from './credentials.js';
import { NOT_AUTHENTICATED } from './auth-guidance.js';

// API base URL is resolved per-request (see callZephlyAPI): getApiUrl() honors
// the EZMODO_API_URL / ZEPHLY_API_URL override; CONFIG.apiUrl is the build-time
// default. Resolving per-call (not at module load) keeps it correct regardless
// of when the env var is set, and lets a desktop/self-hosted runner point the
// MCP server at a non-production API.

/**
 * Bodies larger than this (bytes, uncompressed JSON) are gzip-compressed and
 * sent with Content-Encoding: gzip instead of the base64 WAF wrapper. gzip both
 * shrinks the payload (~10-20x for schema/manifest JSON, vs base64's +33%
 * inflation) and is WAF-safe (binary body, not pattern-matchable), so large
 * uploads like DB schema snapshots stay well under Cloud Run's 32 MB request
 * limit. The Go API's MCP routes decompress gzip request bodies transparently.
 */
const GZIP_THRESHOLD_BYTES = 64 * 1024;

/**
 * Encode string to base64
 */
function encodeBase64(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Encode entire request body to prevent WAF blocking
 * Wraps the entire payload in a base64-encoded container
 *
 * This is simpler and more reliable than field-by-field encoding:
 * - No maintenance of field lists
 * - Bulletproof against all WAF rules
 * - Works for any future fields automatically
 */
function encodeBodyForWAF(data) {
  if (data === null || data === undefined || Object.keys(data).length === 0) {
    return data;
  }

  // Encode the entire body as a single base64 string
  const jsonString = JSON.stringify(data);
  return {
    __base64_body: true,
    value: encodeBase64(jsonString)
  };
}

/**
 * Call Zephly API endpoint
 * @param {string} endpoint - Endpoint name (e.g., 'mcpCreateTask')
 * @param {object} data - Request data
 * @returns {Promise<any>} - API response (unwrapped from Go API structure)
 */
export async function callZephlyAPI(endpoint, data) {
  // Get endpoint mapping (route + HTTP method)
  const mapping = ENDPOINT_MAP[endpoint];

  if (!mapping) {
    throw new Error(`Unknown endpoint: ${endpoint}. Please update ENDPOINT_MAP.`);
  }

  const { route, method } = mapping;

  // Build URL - for GET and DELETE requests with data, append as query params
  const apiUrl = getApiUrl() || CONFIG.apiUrl;
  let url = `${apiUrl}/${route}`;
  let body = null;

  // Resolved per call, and awaited: an expired OAuth token refreshes here.
  const credential = await resolveCredential();
  if (!credential) {
    // Coded, not just worded: lib/create-server.js turns this into sign-in
    // guidance for the agent, and matching on a message would break the first
    // time someone reworded it.
    const error = new Error('Not authenticated with EzModo.');
    error.code = NOT_AUTHENTICATED;
    throw error;
  }

  const headers = {
    'Authorization': `Bearer ${credential.token}`,
    'Content-Type': 'application/json',
    'User-Agent': `ezmodo-mcp-server/${MCP_VERSION}`,
    'X-MCP-API-Version': 'v1',
  };

  if ((method === 'GET' || method === 'DELETE') && data && Object.keys(data).length > 0) {
    // Convert data object to query parameters for GET and DELETE
    // DELETE requests typically don't have a body and the Go API expects query params
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    url += `?${params.toString()}`;
  } else if (method !== 'GET' && method !== 'DELETE') {
    // For POST/PUT, send data in body.
    const isEmpty = data === null || data === undefined || Object.keys(data).length === 0;
    const rawJson = JSON.stringify(data);
    if (!isEmpty && Buffer.byteLength(rawJson, 'utf-8') > GZIP_THRESHOLD_BYTES) {
      // Large body: gzip the raw JSON. Smaller than base64 and WAF-safe (binary),
      // so big uploads (e.g. DB schema snapshots) don't inflate or time out.
      body = zlib.gzipSync(Buffer.from(rawJson, 'utf-8'));
      headers['Content-Encoding'] = 'gzip';
    } else {
      // Small body: base64-wrap the entire body to prevent WAF blocking.
      body = JSON.stringify(encodeBodyForWAF(data));
    }
  }

  const log = getLogger();
  log.debug('API request', { endpoint, method, route, url });

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  log.debug('API response', { endpoint, status: response.status });

  if (!response.ok) {
    const errorText = await response.text();
    log.error('API error', { endpoint, status: response.status, body: errorText });

    let error;
    try {
      error = JSON.parse(errorText);
    } catch {
      error = { error: response.statusText };
    }

    // Keep the API's own diagnosis on the error rather than flattening the
    // response to its headline. During E-228 #2252 the API was already sending
    // the true cause in `details` ("failed to load task_knowledge: database
    // capacity temporarily exhausted") while this line threw only
    // "Task not found" — so the one caller that could have acted on it, the
    // agent, was told the task did not exist.
    const headline =
      error.error || error.message || `HTTP ${response.status}: ${response.statusText}`;
    const detail = typeof error.details === 'string' ? error.details : null;

    const thrown = new Error(detail && detail !== headline ? `${headline}: ${detail}` : headline);
    // status and retryable let callers back off on a 503 instead of giving up
    // the way a 404 tells them to.
    thrown.status = response.status;
    // A machine-readable code, when the API sent one. Carried so a caller can
    // branch on the KIND of failure rather than on its prose — the no-organization
    // 403 (#2639) is answered with specific guidance, and every other 403 is not.
    if (typeof error.code === 'string' && error.code) {
      thrown.code = error.code;
    }
    if (typeof error.retryable === 'boolean') {
      thrown.retryable = error.retryable;
    }
    throw thrown;
  }

  const result = await response.json();
  log.debug('API success', { endpoint });

  // Go API returns {success, data, metadata}, Cloud Functions return data directly
  // For backward compatibility, unwrap Go API responses if they have the expected structure
  if (result.success === true && result.data !== undefined) {
    return result.data;
  }

  return result;
}
