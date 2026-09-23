/**
 * Public-build fallback for `@emss/oauth2-proxy-frontend`. The public build has
 * no external auth (server runs with MOCK_USER=true), so these are thin wrappers
 * over the standard `fetch`. See emss-fallback/README.md.
 */

const fetchWithAuth = (...args) => fetch(...args);

// Mirrors the real package: the response status is never inspected, so an error
// body is returned as a parsed object and only a parse/transport failure yields an Error.
const fetchJsonWithAuth = async (input, init) => {
  try {
    return await (await fetchWithAuth(input, init)).json();
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
};

export const createFetchWithAuthFunctions = (_authPopup, _loginURL, _userInfoURL) => ({
  fetchWithAuth,
  fetchJsonWithAuth,
});

export const webAuthPopup = async () => {};
