import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";
import store from "./store";
import { Provider } from "react-redux";
import {
  setAutomergeConnectionStatus,
  setBrowserConnectionStatus,
  setClientAppVersion,
} from "store/connection";
import ErrorBoundary from "./components/ErrorBoundary";
import type { NetworkAdapterInterface } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { RepoContext } from "@automerge/automerge-repo-react-hooks";
import { VersionGatedNetworkAdapter } from "client/automerge-network-adapter";

import "./styles/globals.css";
import "./styles/fonts.css";
import { CookiesProvider } from "react-cookie";
import { setupFetchFns } from "packages/fetchFns";
import { getCurrentUser } from "packages/getCurrentUser";
import { clearAllEditing } from "store/crossActions";
import { clientLogger } from "utils/logging/clientLogger";

async function fetchServerAppVersion(): Promise<AppVersion> {
  const res = await fetch(`/api/v1/version?_=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) {
    throw new Error(`Unable to fetch server version: ${res.status} ${res.statusText}`);
  }
  const version = (await res.json()) as AppVersion;
  if (!version?.serverEpochUuid) {
    throw new Error("Server version response is missing serverEpochUuid");
  }
  return version;
}

setupFetchFns();
const user = await getCurrentUser();
let repoClientID = `client-${Math.random().toString(36).slice(2, 5)}`;
if (!user || user instanceof Error) {
  clientLogger.error(
    { logId: "launchpadLogin", logValue: `Unable to get current user, ${user}` },
    new Error(`Unable to get current user: ${user}`)
  );
} else {
  clientLogger.info({
    logId: "launchpadLogin",
    launchpadDisplayName: `${user.display_name || "unknown user"}`,
  });
  repoClientID = `${user.auid}-${Math.random().toString(36).slice(2, 5)}`;
}
clientLogger.info({
  logId: "automergeId",
  automergeId: `${repoClientID}`,
});

// The database epoch must be known before the Automerge socket is opened
let serverAppVersion: AppVersion;
try {
  serverAppVersion = await fetchServerAppVersion();
} catch (error) {
  clientLogger.critical(
    { logId: "appVersion", logValue: "Unable to start AEGIS: server version is unavailable" },
    error instanceof Error ? error : new Error(String(error))
  );
  const failureContainer = document.getElementById("root");
  if (failureContainer) {
    failureContainer.textContent = "Unable to reach the AEGIS server. Please refresh to try again.";
    failureContainer.setAttribute(
      "style",
      "color:white;display:flex;align-items:center;justify-content:center;padding:2rem;"
    );
  }
  // Abort module evaluation: nothing below can run without the epoch.
  throw error;
}

// version and gitCommit come from build-time constants (set in
// vite.config.mts) epoch is taken from the server.
const clientAppVersion: AppVersion = {
  version: __APP_VERSION__,
  gitCommit: __GIT_COMMIT__,
  serverEpochUuid: serverAppVersion.serverEpochUuid,
};
store.dispatch(setClientAppVersion(clientAppVersion));
clientLogger.info({
  logId: "appVersion",
  version: `AEGIS Client Version: ${clientAppVersion.version}, Git Commit: ${clientAppVersion.gitCommit}, Server Epoch: ${clientAppVersion.serverEpochUuid}`,
});

const repo = new Repo({
  network: [
    new VersionGatedNetworkAdapter({
      url: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/automergeSocket/`,
      serverEpochUuid: serverAppVersion.serverEpochUuid,
      onConnectionStatusChange: (status) => {
        store.dispatch(setAutomergeConnectionStatus(status));
        if (status === "disconnected") {
          store.dispatch(clearAllEditing());
        }
      },
    }) as unknown as NetworkAdapterInterface, // connect back to the server via sockets
  ],
  /** @ts-expect-error @type {(import("@automerge/automerge-repo").PeerId)}  */
  peerId: repoClientID,
});

// Add window event listeners for browser/OS network online and offline events
// This event handler has no knowledge of the server and thus will not fire if the server goes offline since the client still has internet
window.addEventListener("offline", () => {
  store.dispatch(setBrowserConnectionStatus("disconnected"));
  store.dispatch(clearAllEditing());
});
window.addEventListener("online", () => {
  store.dispatch(setBrowserConnectionStatus("connected"));
});

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <RepoContext.Provider value={repo}>
        <Provider store={store}>
          <CookiesProvider>
            <BrowserRouter>
              <App launchpadUser={user} />
            </BrowserRouter>
          </CookiesProvider>
        </Provider>
      </RepoContext.Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
