/**
 * Organization Tools
 * MCP tools for managing organizations (workspaces)
 */

export const ORGANIZATION_TOOLS = [
  {
    name: 'get_organization',
    description: 'Get organization info. Returns the default/primary organization, ' +
      'or lists all organizations the user has access to. Use mode "list" to see all ' +
      'workspaces, or omit/use "default" to get the primary one.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['default', 'list'],
          description: 'Mode: "default" returns primary organization, "list" returns all. Default: "default"',
        },
      },
    },
  },
];
