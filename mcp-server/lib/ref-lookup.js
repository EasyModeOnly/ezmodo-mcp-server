/**
 * Turn one reference (E-335: "T:42", "web/T:12", "#42", "E-335") into the id
 * of the entity it names, so get_task / get_epic can take a ref instead of a
 * number + projectId pair.
 *
 * A bare ref means the checkout's project unless projectId is given, the same
 * default resolve_refs uses.
 */
import { callEzmodoAPI } from './http-client.js';
import { localProjectFor } from './local-project.js';

export async function resolveRefToId(ref, expectedType, { projectId, organizationId } = {}) {
  const project = projectId || (await localProjectFor(organizationId));
  const result = await callEzmodoAPI('mcpResolveRefs', {
    refs: [ref], projectId: project, organizationId,
  });
  if (result?.invalid?.length) {
    throw new Error(`"${ref}" is not a reference. Write it as PREFIX:number, e.g. T:42 or web/E:7.`);
  }
  const hit = result?.refs?.[0];
  if (!hit) {
    throw new Error(`Could not resolve "${ref}".`);
  }
  if (hit.entityType !== expectedType) {
    throw new Error(`"${ref}" names a ${hit.entityType}, not a ${expectedType}.`);
  }
  if (!hit.resolved) {
    throw new Error(`"${ref}" did not resolve (${hit.reason}).`);
  }
  return hit.id;
}

/**
 * Replace args.ref with args[idField] when only a ref was given.
 */
export async function withRefResolved(args, idField, expectedType) {
  if (!args?.ref) return args;
  const { ref, ...rest } = args;
  if (rest[idField]) return rest; // an explicit id wins
  const id = await resolveRefToId(ref, expectedType, rest);
  const out = { ...rest, [idField]: id };
  // The number + project pair is superseded by the id.
  delete out.taskNumber;
  delete out.epicNumber;
  return out;
}
