/**
 * Sign-in tools for the LOCAL (stdio) server (#2632).
 *
 * Never served remotely: over the connector, Claude performs its own OAuth
 * before a single tool call is made, so an `authenticate` tool there would be
 * an inert second sign-in offering to confuse people with. See
 * lib/remote-tools.js.
 */

export const AUTH_TOOLS = [
  {
    name: 'authenticate',
    description:
      'Sign this EzModo MCP server in, or report who it is signed in as. You ' +
      'rarely need `login`: any tool called with no credential starts the ' +
      'browser sign-in itself and returns its `authUrl` — SHOW THAT URL TO THE ' +
      'USER, then retry the original call once they have approved it. Use ' +
      '`status` to see which account calls run as (useful when the browser ' +
      'signed in silently from an existing session), and `sign_out` to switch ' +
      'accounts. Not needed when EZMODO_API_KEY is set.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['login', 'status', 'sign_out'],
          description:
            'login: start browser sign-in and return the URL to open (default). ' +
            'status: report the current credential without changing anything. ' +
            'sign_out: forget the stored tokens. Does not affect EZMODO_API_KEY ' +
            'or the ezmodo CLI login, neither of which this server owns.',
        },
      },
    },
  },
];
