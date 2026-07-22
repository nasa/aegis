/**
 * Public-build fallback for `@emss/oauth2-proxy-frontend`. The public build has
 * no external auth (server runs with MOCK_USER=true), so these are thin wrappers
 * over the standard `fetch`. See emss-fallback/README.md.
 */

const fetchWithAuth = (...args) => fetch(...args);

const fetchJsonWithAuth = async (input, init) => {
  const response = await fetch(input, init);
  if (!response.ok) {
    return new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
};

export const createFetchWithAuthFunctions = (_authPopup, _loginURL, _userInfoURL) => ({
  fetchWithAuth,
  fetchJsonWithAuth,
});

export const webAuthPopup = async () => {};
