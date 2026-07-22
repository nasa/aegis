/**
 * Public-build fallback for `@emss/oauth2-proxy-backend`. The public build runs
 * with MOCK_USER=true, so `getUserFromJWT` is never reached (getUser returns a
 * mock user first). See emss-fallback/README.md.
 */

export const getUserFromJWT = (_req) =>
  new Error("JWT-based auth is not available in this build. Set MOCK_USER=true for local use.");

export const handleUnableToDecodeJWT = (err, res) => {
  res.status(401).json({ status: "error", message: err.message });
};
