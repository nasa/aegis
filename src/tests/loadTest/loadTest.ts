import "utils/loadEnv";
import {
  attachSocketListeners,
  cleanupSocketListeners,
  createClientSocket,
} from "utils/clientSocketHelpers";
import type { RootState } from "store/index";
import reduxStore from "store/index";
import { populateStore } from "store/processing/populateStore";
import { setAllSliceStores } from "store/crossActions";
import { workerData, parentPort } from "worker_threads";
import { createHash } from "crypto";
import { setUserState } from "store/user";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import type { NetworkAdapterInterface } from "@automerge/automerge-repo";
import { Repo } from "@automerge/automerge-repo";
import { setClientAppVersion } from "store/connection";

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

    // Identity comes from the SSO token. Against a load-test target
    // running with MOCK_USER the resolved identity is the mock user.
    const accessRes = await fetch(`${serverURL}/api/v1/user/current`);
    const access = (await accessRes.json()) as CurrentUser;
    if (!access?.launchpadUser) {
      console.error("Unable to resolve the current user");
      process.exit(1);
    }
    dispatch(
      setUserState({
        isLoggedIn: !!access.launchpadUser,
        launchpadUser: access.launchpadUser,
        appUserId: access.appUser?.id ?? null,
        missionPermLevel: "edit",
      })
    );

    // Get the server app version so we can pass through the epoch uuid
    const versionRes = await fetch(`${serverURL}/api/v1/version?_=${Date.now()}`, {
      cache: "no-store",
    });
    const serverAppVersion: AppVersion = await versionRes.json();

    // connect to the automerge repo
    const repoClientID = `loadTestClient-${Math.random().toString(36).slice(2, 5)}`;
    const automergeRepo = new Repo({
      network: [
        new BrowserWebSocketClientAdapter(
          `${serverURL}/api/automergeSocket/?serverEpochUuid=${encodeURIComponent(
            serverAppVersion.serverEpochUuid
          )}`
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
        cookies: "",
      },
      automergeRepo,
    });
    dispatch(setAllSliceStores(wholeStoreState));
    // these values are defined in esbuild.loadtest.mjs and are set at build time
    dispatch(
      setClientAppVersion({
        version: __APP_VERSION__,
        gitCommit: __GIT_COMMIT__,
        serverEpochUuid: serverAppVersion.serverEpochUuid,
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
    const socket = createClientSocket(serverURL, { rejectUnauthorized: false });
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
