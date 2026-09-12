/**
 * What an agent is told when a call cannot be authenticated (#2632).
 *
 * The hard problem this solves: a stdio MCP server is started headlessly by an
 * editor, with no terminal a human is watching. It cannot say "go to this URL".
 * The server's own clear startup message goes to a stderr log nobody opens —
 * which is exactly how #2611 produced an opaque CONNECTION_CLOSED instead of
 * the message that was right there.
 *
 * So don't fight it. Use the channel the agent is already reading: the tool
 * result. The agent shows the URL in chat, the user clicks, the agent retries.
 * This is the pattern the claude.ai connector already uses, and it is better UX
 * than an environment variable rather than a workaround for one.
 *
 * Everything here is DATA in a tool result, never a thrown transport error: a
 * result is something the model can read and act on, an exception is not.
 */

import { CONFIG } from '../config/index.js';

/** Marks the "there is no credential at all" failure, so dispatch can spot it. */
export const NOT_AUTHENTICATED = 'EZMODO_NOT_AUTHENTICATED';

/**
 * The API's code for "signed in, but in no organization" (#2639).
 *
 * Must match middleware.CodeNoOrganization in
 * api/internal/api/middleware/oidc_mcp_auth.go. A code rather than a message
 * match, because the message is prose someone will improve.
 */
export const NO_ORGANIZATION = 'NO_ORGANIZATION';

/**
 * The API's code for "this email already belongs to another identity" (#2652).
 *
 * Must match middleware.CodeEmailAlreadyRegistered. Kept separate from
 * NO_ORGANIZATION because the answers point opposite ways: that one sends you
 * to onboarding, and onboarding is exactly where this one fails again.
 */
export const EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED';

/**
 * The two things a user cannot guess, and will otherwise hit as bare failures.
 *
 * Stated on every sign-in prompt on purpose. Both are consequences of decisions
 * made elsewhere, and neither is discoverable from the error the user would
 * otherwise see.
 */
const CAVEATS = [
  'A browser is required. This connector cannot take a username and password ' +
    'directly — direct access grants are disabled on it deliberately, because ' +
    'skipping the browser also skips the consent screen, which is the whole ' +
    'reason for using OAuth here rather than a pasted key.',
  'A brand-new EzModo account belongs to no organization yet, so tools will ' +
    'return 403 until it does. That is an access problem, not a sign-in ' +
    'problem — signing in again will not change it. The call that hits it ' +
    'says how to fix it; see `organizationRequired` below.',
];

/**
 * The payload returned when a sign-in is needed.
 *
 * @param {object} options
 * @param {string} [options.authUrl] The URL to open, when a flow has started.
 * @param {string} [options.reason]  What went wrong, in one line.
 */
export function signInRequired({ authUrl, reason } = {}) {
  return {
    authenticated: false,
    reason: reason || 'No EzModo credential is available.',
    ...(authUrl
      ? {
        action_required: 'Open this URL in a browser, approve the access, then retry the call.',
        authUrl,
      }
      : {
        action_required:
            'Call the `authenticate` tool to start sign-in. It returns a URL to open.',
      }),
    alternatives: [
      `Set EZMODO_API_KEY in the environment instead — generate a key at ${CONFIG.settingsUrl}. ` +
        'This is the right path for CI and anything headless.',
    ],
    notes: CAVEATS,
  };
}

/**
 * The payload returned when the caller is signed in but belongs to no
 * organization (#2639).
 *
 * Why this is a separate answer from `signInRequired`, and not a widening of
 * it: sign-in already worked. Sending this person back through a browser flow
 * produces the identical token and the identical failure, which is precisely
 * why #2632 kept 403 out of that funnel. What they need is the OTHER half of
 * onboarding — a workspace — and EzModo already has a surface for it.
 *
 * SO THIS DOES NOT INVENT A MECHANISM. The web app routes a signed-in user
 * with no organizations to /onboarding, which offers a personal workspace, a
 * new team, or /join — workspace discovery, which lists organizations matching
 * a verified email domain and joins none of them without a click. Matching an
 * organization here instead would be a second, quieter copy of that consent
 * decision, and the quiet copy is the one that gets it wrong.
 *
 * Returned on BOTH surfaces, unlike the sign-in prompt. Over the connector
 * Claude owns the OAuth, so sign-in advice from here would be wrong — but the
 * missing workspace is ours either way, and a claude.ai user hits it exactly
 * as a local one does.
 *
 * @param {object} options
 * @param {string} [options.reason] What the API said, in one line.
 */
export function organizationRequired({ reason } = {}) {
  return {
    authenticated: true,
    organization: null,
    reason:
      reason ||
      'This account is signed in but does not belong to any EzModo organization.',
    action_required:
      'Open the URL below and finish setting up a workspace, then retry the call. ' +
      'You can create a personal workspace, create a team, or ask to join an ' +
      'organization your verified email already matches.',
    onboardingUrl: `${CONFIG.webUrl}/onboarding`,
    notes: [
      'Sign-in itself succeeded. Signing in again will not change this, and ' +
        'no credential — OAuth token or API key — can substitute for belonging ' +
        'to an organization.',
      'If you expected to already be a member of one, you are probably signed ' +
        `in as a different identity than you think. Check which email ${CONFIG.webUrl}/onboarding ` +
        'shows, and ask an administrator to invite that exact address.',
    ],
  };
}

/**
 * The payload returned when sign-in succeeded but no account could be created
 * for it, because the email already belongs to a different EzModo identity
 * (#2652).
 *
 * The reason this is not folded into `organizationRequired`: both used to look
 * identical from outside — a signed-in caller getting nothing back — and the
 * fix for one is a dead end for the other. Creating a workspace runs the same
 * insert against the same unique index and fails the same way. Telling someone
 * to go do that is worse than telling them nothing, because they will believe
 * it and try.
 *
 * There is deliberately no self-service action here. Merging two identities
 * onto one account is exactly the operation that must not be automated from an
 * unauthenticated-by-the-other-party direction, so the honest answer is the
 * original sign-in method, or a human.
 *
 * @param {object} options
 * @param {string} [options.reason] What the API said, in one line.
 */
export function emailAlreadyRegistered({ reason } = {}) {
  return {
    authenticated: true,
    accountProvisioned: false,
    reason:
      reason ||
      'This email address already belongs to a different EzModo account, so no ' +
        'account could be created for the identity you signed in with.',
    action_required:
      'Sign in the way you originally did — a password, or whichever of Google, ' +
        'Microsoft, GitHub or Apple you used first. If you need the two linked, ' +
        'contact support.',
    notes: [
      'Creating a workspace will NOT fix this, and neither will signing in ' +
        'again through the same provider. Nothing is wrong with the sign-in; ' +
        'the account simply could not be created.',
      `You can check which address is in use at ${CONFIG.webUrl}/settings.`,
    ],
  };
}
