/**
 * Deliverable handlers (E-280 #3089). A deliverable is what a project ships on
 * its own version line (api, web, desktop). It is a RELEASE axis only: work is
 * never linked to a deliverable and it carries no progress figure. Work reaches
 * a deliverable only through a release's contents.
 *
 * Thin like the release handlers: one API call per action, and the API does
 * the validation and says why when it refuses.
 */

import { callEzmodoAPI } from '../lib/http-client.js';
import { readConfig } from '../lib/local-cache.js';

const PATH_MODES = ['add', 'remove', 'replace'];

/**
 * The caller's projectId, else the one in this repo's .ezmodo/config.json.
 * Throws when neither exists, naming the action, rather than letting the API
 * answer a confusing "projectId is required".
 */
export async function projectIdFor(args, action) {
  if (args.projectId) return args.projectId;
  const fromConfig = (await readConfig())?.projectId;
  if (fromConfig) return fromConfig;
  throw new Error(`${action} needs projectId (no .ezmodo/config.json to default it from).`);
}

function need(args, keys, action) {
  const missing = keys.filter((k) => args[k] === undefined || args[k] === null || args[k] === '');
  if (missing.length) {
    throw new Error(`${action} needs ${missing.join(', ')}.`);
  }
}

function pick(args, keys) {
  const out = {};
  for (const k of keys) {
    if (args[k] !== undefined && args[k] !== null) out[k] = args[k];
  }
  return out;
}

export async function manageDeliverable(args = {}) {
  const { action } = args;
  switch (action) {
  case 'list':
    return callEzmodoAPI('mcpListDeliverables', { projectId: await projectIdFor(args, action) });
  case 'create': {
    need(args, ['name'], action);
    return callEzmodoAPI('mcpCreateDeliverable', {
      projectId: await projectIdFor(args, action), ...pick(args, ['key', 'name', 'route', 'paths']),
    });
  }
  case 'update': {
    need(args, ['deliverable'], action);
    const body = pick(args, ['key', 'name', 'position', 'route', 'paths']);
    if (args.makeDefault) body.makeDefault = true;
    if (Object.keys(body).length === 0) {
      throw new Error('update needs at least one of key, name, position, makeDefault, route, paths.');
    }
    return callEzmodoAPI('mcpUpdateDeliverable', {
      projectId: await projectIdFor(args, action), deliverable: args.deliverable, ...body,
    });
  }
  case 'paths': {
    need(args, ['deliverable'], action);
    if (!Array.isArray(args.paths)) throw new Error('paths needs paths (an array of repo-relative folders).');
    const mode = args.mode ?? 'replace';
    if (!PATH_MODES.includes(mode)) throw new Error(`paths mode must be one of ${PATH_MODES.join(', ')}.`);
    return callEzmodoAPI('mcpSetDeliverablePaths', {
      projectId: await projectIdFor(args, action), deliverable: args.deliverable, paths: args.paths, mode,
    });
  }
  case 'route':
    need(args, ['deliverable'], action);
    if (!Array.isArray(args.route)) {
      throw new Error('route needs route (environment ids or keys, in any order; [] = every environment).');
    }
    return callEzmodoAPI('mcpSetDeliverableRoute', {
      projectId: await projectIdFor(args, action), deliverable: args.deliverable, route: args.route,
    });
  case 'delete':
    need(args, ['deliverable'], action);
    return callEzmodoAPI('mcpDeleteDeliverable', {
      projectId: await projectIdFor(args, action), deliverable: args.deliverable,
    });
  default:
    throw new Error(`Unknown action: ${action}`);
  }
}
