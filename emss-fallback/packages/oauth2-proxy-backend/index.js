/**
 * Public-build fallback for `@emss/oauth2-proxy-backend`. The public build runs
 * with MOCK_USER=true, so `getUserFromJWT` is never reached (getUser returns a
 * mock user first). See emss-fallback/README.md.
 */

export const getUserFromJWT = (_req) =>
  new Error("JWT-based auth is not available in this build. Set MOCK_USER=true for local use.");

// Mirrors the real package: a missing header is a 401, anything else is a 500,
// both with a bare `msg` body rather than the WrappedResponse envelope.
export const handleUnableToDecodeJWT = (err, res) => {
  if (err.message === "X-Access-Token not found in headers") {
    res.status(401).json({ msg: "Missing auth token" });
    return;
  }
  const msg = "Unable to decode JWT";
  console.error(msg, err);
  res.status(500).json({ msg });
};
