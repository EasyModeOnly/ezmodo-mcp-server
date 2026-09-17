/**
 * Unmapped code path tools (E-258 #2756)
 *
 * When Components were retired, every component source path that belonged to no
 * feature was recorded for review instead of being dropped. Each row is one
 * question — "which capability owns this code?" — and until it is answered, work
 * touching those files auto-links to nothing.
 *
 * The list lived only on the project Features page, so an agent asked to tidy it
 * could set feature paths but never see or close the rows. These two tools make
 * that loop completable.
 */

export const UNMAPPED_PATH_TOOLS = [
  {
    name: 'list_unmapped_paths',
    description: 'List a project\'s unmapped code paths — former component paths that no feature owns ' +
      '(E-258). Each row carries the source path and the component it came from. A pending row means ' +
      'work touching those files links to no capability, so this is the backlog to work through when ' +
      'a project\'s features are missing code ownership.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        status: {
          type: 'string',
          enum: ['pending', 'assigned', 'dismissed', 'all'],
          description: 'Which rows to return (default "pending")',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'resolve_unmapped',
    description: 'Resolve unmapped code paths (E-258). "reconcile" is the one to reach for first: it ' +
      'closes every pending row a feature has SINCE been given a path for, so the usual flow is to set ' +
      'ownership with manage_feature action:"paths" and then reconcile, rather than answering rows one ' +
      'by one. A path several features own stays pending — shared ownership is a judgement, and those ' +
      'only ever produce link suggestions anyway.\n\n' +
      '"assign" gives ONE row to a feature (adding that feature path, with the usual scope check), and ' +
      '"dismiss" records that the path belongs to no capability — the right answer for shared plumbing.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['reconcile', 'assign', 'dismiss'],
          description: 'reconcile: close every pending row an existing feature path already covers. ' +
            'assign: give one row (pathId) to featureId. dismiss: mark one row (pathId) as owned by nobody.',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for every action)',
        },
        pathId: {
          type: 'string',
          description: 'Unmapped path ID, from list_unmapped_paths (required for assign and dismiss)',
        },
        featureId: {
          type: 'string',
          description: 'Feature to give the path to (required for assign). It must span the project, ' +
            'or be org-wide.',
        },
      },
      required: ['action', 'projectId'],
    },
  },
];
