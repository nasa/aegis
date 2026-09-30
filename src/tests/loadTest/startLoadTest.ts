import type { RootState } from "store";
import { Worker } from "worker_threads";
import { detailedDiff } from "deep-object-diff";

const NUM_CLIENTS = 30; // Number of clients to simulate per pipeline job
const CONNECTION_DURATION = 180000; // 3 minutes - each client will stay alive for this long
const DELAY_BETWEEN_CLIENTS = 1000; // 1 second delay between starting each client

/**
 * Starts multiple worker threads to simulate client connections to the server.
 * Each worker will connect, populate the Redux store, and keep the connection alive for a specified duration.
 * After the duration, works will send the final state of the store back to the this parent thread
 * The parent thread will compare the final states of all workers to ensure consistency.
 */
const startWorkers = async ({ serverURL }: { serverURL: string }) => {
  const workerResults: { finalState: RootState; stateHash: string }[] = [];

  for (let i = 0; i < NUM_CLIENTS; i++) {
    // start thread
    const worker = new Worker(`./.local/express/dist/loadTest/loadTest.js`, {
      workerData: { serverURL, duration: CONNECTION_DURATION },
    });

    // attach listeners to the worker
    worker.on("error", (arg1, ...args) => {
      console.error(`[Worker ${i}] Error ${arg1}`, ...args);
    });
    worker.on("exit", (code) => {
      console.error(`[Worker ${i}] Worker exited with code ${code}`);
    });
    // worker will send a message back to parent as it exits.
    worker.on("message", (message: { finalState: RootState; stateHash: string }) => {
      console.log(`[Worker ${i}] Completed. StateHash: ${message.stateHash}`);
      workerResults.push(message); // store the final state and its hash in an array

      // check if this was the last worker to finish
      if (workerResults.length === NUM_CLIENTS) {
        let allStatesEqual = true;
        console.log("Last worker has completed. Comparing Results:");
        // compare the final states of all workers
        for (let i = 1; i < workerResults.length; i++) {
          if (workerResults[i].stateHash !== workerResults[0].stateHash) {
            allStatesEqual = false;
            console.error(
              `Worker ${i} stateHash does not match Worker 0: ${workerResults[i].stateHash} !== ${workerResults[0].stateHash}`
            );
            // print a diff of the states
            let diff = JSON.stringify(
              detailedDiff(workerResults[i].finalState, workerResults[0].finalState),
              null,
              2
            );
            if (diff.length > 5000) {
              diff = diff.slice(0, 5000) + "... (trimmed output)";
            }
            console.error(diff);
            break;
          }
        }
        if (allStatesEqual) {
          console.log("✔️  All worker states are equal.");
          process.exit(0);
        } else {
          console.error("❌  Worker states differ.");
          process.exit(1);
        }
      }
    });

    // wait a bit before starting the next worker
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CLIENTS));
  }
};

// get URL from command line arguments
const serverURL = process.argv[2];

if (serverURL) {
  console.log(
    `Attempting to start load test at ${serverURL}
	number of clients                      = ${NUM_CLIENTS}
	delay between each client start (ms)   = ${DELAY_BETWEEN_CLIENTS}
	each client lifespan (ms)              = ${CONNECTION_DURATION}`
  );
  startWorkers({ serverURL });

  // kill this parent process after a reasonable amount of time in case some thing goes wrong
  setTimeout(
    () => {
      console.error("[ERROR] Workers did not exit with expected time. Forcing exit.");
      process.exit(1);
    },
    (CONNECTION_DURATION + NUM_CLIENTS * DELAY_BETWEEN_CLIENTS) * 1.5
  );
} else {
  console.log("Must specify an execute URL");
}
