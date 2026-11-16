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
const BUMPS = ['patch', 'minor', 'major'];

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
      projectId: await projectIdFor(args, action), ...pick(args, ['key', 'name', 'route', 'paths', 'versioning']),
    });
  }
  case 'update': {
    need(args, ['deliverable'], action);
    const body = pick(args, ['key', 'name', 'position', 'route', 'paths', 'versioning']);
    if (args.makeDefault) body.makeDefault = true;
    if (Object.keys(body).length === 0) {
      throw new Error('update needs at least one of key, name, position, makeDefault, route, paths, versioning.');
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
  case 'versions':
    need(args, ['deliverable'], action);
    return callEzmodoAPI('mcpReleaseVersionPlan', {
      projectId: await projectIdFor(args, action), deliverable: args.deliverable, ...pick(args, ['check']),
    });
  case 'version_on_main':
    need(args, ['deliverable'], action);
    return callEzmodoAPI('mcpDeliverableVersionsOnMain', {
      projectId: await projectIdFor(args, action), deliverable: args.deliverable,
    });
  case 'next_version': {
    need(args, ['deliverable'], action);
    if (args.bump !== undefined && !BUMPS.includes(args.bump)) {
      throw new Error(`next_version bump must be one of ${BUMPS.join(', ')}.`);
    }
    return callEzmodoAPI('mcpReleaseNextVersion', {
      projectId: await projectIdFor(args, action), deliverable: args.deliverable, format: 'json',
      ...pick(args, ['bump', 'releaseId', 'milestoneId']),
    });
  }
  case 'bump':
    return callEzmodoAPI('mcpBumpDeliverables', {
      projectId: await projectIdFor(args, action), items: bumpItems(args), ...pick(args, ['release']),
    });
  case 'report_bump': {
    // A bump made here, not by EzModo (#3824): recorded so the release shows
    // the PR, and so a project with no connected repo has a version on main.
    need(args, ['deliverable', 'version'], action);
    if (args.state !== undefined && !['opened', 'merged'].includes(args.state)) {
      throw new Error('report_bump state must be opened or merged.');
    }
    return callEzmodoAPI('mcpReportDeliverableBump', {
      projectId: await projectIdFor(args, action), source: 'agent',
      ...pick(args, ['deliverable', 'version', 'number', 'url', 'branch', 'repo', 'commitSha', 'state', 'source']),
    });
  }
  default:
    throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * The deliverables a bump names: items, or one deliverable + version.
 */
function bumpItems(args) {
  if (Array.isArray(args.items) && args.items.length) {
    const bad = args.items.filter((it) => !it || !it.deliverable || !it.version);
    if (bad.length) throw new Error('bump items each need deliverable and version.');
    return args.items.map(({ deliverable, version }) => ({ deliverable, version }));
  }
  if (args.deliverable && args.version) return [{ deliverable: args.deliverable, version: args.version }];
  throw new Error('bump needs items ([{deliverable, version}]) or deliverable + version.');
}
