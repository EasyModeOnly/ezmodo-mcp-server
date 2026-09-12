/**
 * Per-request credential context.
 *
 * Over stdio the server belongs to one user for its whole life, so the API key
 * can live in the environment and `lib/http-client.js` can read it whenever it
 * likes. Over HTTP that assumption is gone: one process serves many callers,
 * each with their own credential, and requests interleave (#2599).
 *
 * AsyncLocalStorage is what makes that a five-line change instead of a
 * signature change through every handler. The transport runs each request
 * inside `withRequestContext`, and `resolveApiKey()` picks up whatever that
 * request carried — through every await, without any handler knowing it exists.
 *
 * The environment remains the fallback, and that is what keeps stdio working
 * untouched: no context, no behaviour change.
 *
 * The safety property worth stating: a leaked context is a request answered
 * with SOMEONE ELSE'S credential. So the store is only ever written by
 * withRequestContext, is never mutated in place, and nothing exported here can
 * set it for longer than one callback.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { getApiKey } from './env.js';

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with `context` bound to it and everything it awaits.
 *
 * @param {{ apiKey?: string }} context
 * @param {() => Promise<T>|T} fn
 * @returns {Promise<T>|T}
 * @template T
 */
export function withRequestContext(context, fn) {
  return storage.run(Object.freeze({ ...context }), fn);
}

/** The current request's context, or undefined outside one. */
export function getRequestContext() {
  return storage.getStore();
}

/**
 * The credential for the request in flight.
 *
 * Request context wins over the environment. Over HTTP that is the whole
 * point; over stdio there is no context and this is exactly getApiKey().
 */
export function resolveApiKey() {
  return storage.getStore()?.apiKey || getApiKey();
}
