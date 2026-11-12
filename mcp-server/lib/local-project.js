/**
 * The project this checkout is configured for, when it belongs to the
 * organization a call names (E-326 #3676). Designs and catalogs belong to a
 * project, so a create that names none defaults to the repo's project rather
 * than the workspace's shared library, and a design-system read is scoped to
 * it instead of spanning every project.
 *
 * Returns undefined when there is no `.ezmodo/config.json` (the remote
 * connector) or it is for another organization: the server then decides
 * (shared library for a create, the whole org for a read).
 */
import { readConfig } from './local-cache.js';

export async function localProjectFor(organizationId) {
  const config = await readConfig();
  if (!config?.projectId) return undefined;
  if (organizationId && config.organizationId && config.organizationId !== organizationId) {
    return undefined;
  }
  return config.projectId;
}
