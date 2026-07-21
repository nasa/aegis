import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";
import store from "./store";
import { Provider } from "react-redux";
import { setBrowserConnectionStatus } from "store/connection";
import ErrorBoundary from "./components/ErrorBoundary";
import type { NetworkAdapterInterface } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { RepoContext } from "@automerge/automerge-repo-react-hooks";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";

import "./styles/globals.css";
import "./styles/fonts.css";
import { CookiesProvider } from "react-cookie";
import { setupFetchFns } from "packages/fetchFns";
import { getCurrentUser } from "packages/getCurrentUser";
import { clearAllEditing } from "store/crossActions";
import { clientLogger } from "utils/logging/clientLogger";

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

const repo = new Repo({
  network: [
    new BrowserWebSocketClientAdapter(
      `${window.location.protocol}//${window.location.hostname}:${window.location.port}/socketAutomerge/`
    ) as unknown as NetworkAdapterInterface, // connect back to the server via sockets
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
