/**
 * Browser login helpers for the oauth2-proxy gateway. See emss-fallback/README.md.
 */

export const createFetchWithAuthFunctions = (authPopup, loginURL, userInfoURL) => {
  let login;
  const fetchWithAuth = async (input, init) => {
    const options = { ...init, redirect: "error" };
    // Clone before sending so a Request with a body can be retried once.
    const retryInput = input instanceof Request ? input.clone() : input;
    let response;
    try {
      response = await fetch(input, options);
    } catch (err) {
      if (options.signal?.aborted || err?.name === "AbortError") throw err;
    }
    if (response) {
      if (response.status !== 401) return response;
      // AEGIS also uses 401 for permission denials. A valid session needs no login.
      try {
        const session = await fetch(userInfoURL, { redirect: "error", cache: "no-store" });
        if (session.ok && typeof (await session.json()).email === "string") return response;
      } catch {
        // The gateway may redirect an expired session to the identity provider.
      }
    }
    if (!login) {
      login = Promise.resolve()
        .then(() => authPopup({ loginURL, userInfoURL }))
        .finally(() => {
          login = undefined;
        });
    }
    await login;
    return fetch(retryInput, options);
  };
  const fetchJsonWithAuth = async (input, init) => {
    try {
      return await (await fetchWithAuth(input, init)).json();
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  };
  return { fetchWithAuth, fetchJsonWithAuth };
};

export const webAuthPopup = async ({ loginURL, userInfoURL, period = 1000, retry = 120 }) => {
  const authWindow = window.open(loginURL, "login-window");
  if (!authWindow) throw new Error("Unable to open auth window; allow popups and retry");
  try {
    for (let attempt = 0; attempt < retry; attempt++) {
      if (authWindow.closed) throw new Error("Login window was closed");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(period, 5000));
      try {
        const response = await fetch(userInfoURL, {
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok && typeof (await response.json()).email === "string") return;
      } catch {
        // Login may still be in progress or the gateway temporarily unavailable.
      } finally {
        clearTimeout(timeout);
      }
      await new Promise((resolve) => setTimeout(resolve, period));
    }
    throw new Error("Timed out waiting for login");
  } finally {
    authWindow.close();
  }
};
