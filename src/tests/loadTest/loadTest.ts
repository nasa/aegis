import "utils/loadEnv";
import { attachSocketListeners, cleanupSocketListeners, createSocket } from "utils/socketStuff";
import reduxStore, { RootState } from "store/index";
import { populateStore } from "store/processing/populateStore";
import { setAllSliceStores } from "store/crossActions";
import { workerData, parentPort } from "worker_threads";
import { createHash } from "crypto";
import { setAppUser } from "store/user";

/**
 * Worker thread for simulating a client connection to the server.
 * This worker will connect to the server, populate the Redux store,
 * and then keep the connection alive for a specified duration.
 * After the duration, it will send the final state of the store back to the parent thread.
 */

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
  const { dispatch } = reduxStore;

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
      missionPerms: { missionId: 34, permissions: { view: true, edit: true } },
    })
  );
  // Extract cookies from login response
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

  // initialize and populate the store. mission 34 is used for load testing
  const wholeStoreState = await populateStore({
    missionId: 34,
    runAudit: false,
    loadTestOptions: {
      serverURL: serverURL,
      cookies: formattedCookieStr,
    },
  });
  dispatch(setAllSliceStores(wholeStoreState));

  // attach refs so that the socket listeners can access the latest values
  const userRef = { current: reduxStore.getState().user };
  const interfaceStoreRef = { current: reduxStore.getState().interface };
  reduxStore.subscribe(() => {
    userRef.current = reduxStore.getState().user;
    interfaceStoreRef.current = reduxStore.getState().interface;
  });

  // add socket listeners
  const socket = createSocket(serverURL);
  attachSocketListeners(socket, dispatch, interfaceStoreRef, userRef, 34);

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
})
  // after the thread is done, get the final state, hash it, and send it to parent
  .then(({ finalState }) => {
    const sanitizedState = {
      ...finalState,
      interface: {
        ...finalState.interface,
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
