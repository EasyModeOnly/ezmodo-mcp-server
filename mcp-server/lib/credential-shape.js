const MAX_TOKEN_LENGTH = 8192;

/**
 * Whether a bearer value could be a credential at all: an EzModo API key or a
 * JWT (three base64url segments), within a sane length. Checked BEFORE the
 * body is read (E-297 #3354): any "Bearer x" used to buy an 8 MB buffered read,
 * which made the endpoint a cheap memory sink. This is a shape check only; the
 * API still decides whether the credential is valid.
 */
export function plausibleCredential(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return false;
  // Keys are the prefix plus alphanumerics today (apikeys.generateKeyWithPrefix);
  // older keys are allowed any printable ASCII so none is locked out.
  if (/^(ezm|zeph)_sk_[!-~]{8,}$/.test(token)) return true;
  return /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(token);
}

