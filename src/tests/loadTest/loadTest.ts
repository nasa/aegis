import "utils/loadEnv";
import { attachSocketListeners, cleanupSocketListeners, createSocket } from "utils/socketStuff";
import type { RootState } from "store/index";
import reduxStore from "store/index";
import { populateStore } from "store/processing/populateStore";
import { setAllSliceStores } from "store/crossActions";
import { workerData, parentPort } from "worker_threads";
import { createHash } from "crypto";
import { setAppUser } from "store/user";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { NetworkAdapterInterface } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { setAppVersion } from "store/connection";

/**
 * Worker thread for simulating a client connection to the server.
 * This worker will connect to the server, populate the Redux store,
 * and then keep the connection alive for a specified duration.
 * After the duration, it will send the final state of the store back to the parent thread.
 */

const TEST_MISSION_ID = 34; // mission used for load testing

// data passed in from the worker thread
const { serverURL, duration } = workerData as { serverURL: string; duration: number };

if (!parentPort) {
  console.error("parentPort is null");
  process.exit(1);
}

if (!serverURL || !duration) {
  console.error("serverURL and duration must be defined");
  process.exit(1);
}

// main code for the worker thread
new Promise(async (resolve: (value: { finalState: RootState }) => void) => {
  try {
    const { dispatch } = reduxStore;

    // Disable TLS certificate validation for load testing locally with self-signed certs
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    // login to the server
    const loginRes = await fetch(`${serverURL}/api/v1/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "loadtest", password: process.env.LOADTEST_PASSWORD }),
      headers: { "Content-Type": "application/json" },
    });

    const loginJson: WrappedResponse<AppUser> = await loginRes.json();
    if (loginJson.status !== "success") {
      console.error("Login failed:", loginJson.message);
      process.exit(1);
    }
    dispatch(
      setAppUser({
        isLoggedIn: true,
        user: loginJson.data,
        missionPerms: { missionId: TEST_MISSION_ID, permissions: { view: true, edit: true } },
      })
    );
    // Extract cookies from login response for auth in subsequent api requests
    const cookieFromHeader = loginRes.headers.get("set-cookie");
    let formattedCookieStr = "";
    if (cookieFromHeader) {
      // Parse multiple cookies if they exist
      const cookies = cookieFromHeader.split(",").map((cookie) => {
        // Extract just the name=value part before the first semicolon
        return cookie.split(";")[0].trim();
      });
      formattedCookieStr = cookies.join("; ");
    }

    // connect to the automerge repo
    const repoClientID = `loadTestClient-${Math.random().toString(36).slice(2, 5)}`;
    const automergeRepo = new Repo({
      network: [
        new BrowserWebSocketClientAdapter(
          `${serverURL}/api/v1/socketAutomerge/`
        ) as unknown as NetworkAdapterInterface, // connect back to the server via sockets
      ],
      // storage: new IndexedDBStorageAdapter(),
      /** @ts-expect-error @type {(import("@automerge/automerge-repo").PeerId)}  */
      peerId: repoClientID,
    });

    // initialize and populate the store.
    const wholeStoreState = await populateStore({
      missionId: TEST_MISSION_ID,
      runAudit: false,
      loadTestOptions: {
        serverURL: serverURL,
        cookies: formattedCookieStr,
      },
      automergeRepo,
    });
    dispatch(setAllSliceStores(wholeStoreState));
    // these values are defined in esbuild.loadtest.mjs and are set at build time
    dispatch(
      setAppVersion({
        version: __APP_VERSION__,
        gitCommit: __GIT_COMMIT__,
      })
    );

    // attach refs so that the socket listeners can access the latest values
    const userRef = { current: reduxStore.getState().user };
    const connectionStoreRef = { current: reduxStore.getState().connection };
    reduxStore.subscribe(() => {
      userRef.current = reduxStore.getState().user;
      connectionStoreRef.current = reduxStore.getState().connection;
    });

    // Add socket listeners
    // Disable TLS verification for self-signed certificates in load testing
    const socket = createSocket(serverURL, { rejectUnauthorized: false });
    attachSocketListeners(socket, dispatch, connectionStoreRef, userRef, TEST_MISSION_ID);

    let keepAlive = true;

    // if duration is reached, resolve the promise and exit
    setTimeout(() => {
      keepAlive = false;
      cleanupSocketListeners(socket);
      const finalStoreState: RootState = reduxStore.getState();
      resolve({ finalState: finalStoreState });
    }, duration);

    // eslint-disable-next-line no-unmodified-loop-condition
    while (keepAlive) {
      // yield control to the event loop to allow the setTimeout to execute
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})
  // after the thread is done, get the final state, hash it, and send it to parent
  .then(({ finalState }) => {
    const sanitizedState = {
      ...finalState,
      connection: {
        ...finalState.connection,
        // Clear out socket status. As threads close down, these will differ because
        //  emits are being continuously sent with new user counts
        socketStatus: {},
      },
    };
    // hash the final state
    const stateHash = createHash("md5").update(JSON.stringify(sanitizedState)).digest("hex");

    // send a message back to parent thread with final results
    parentPort.postMessage({
      finalState: sanitizedState,
      stateHash,
    });
  })
  .catch((err) => {
    console.error("[Error] An error occurred in the worker thread:", err);
  });
