/**
 * Client-side database epoch guard.
 *
 * When the server performs an authoritative database restore it replaces the
 * Automerge storage backing with a fresh copy and advances the "database
 * epoch" — a UUID that uniquely identifies the current generation of stored
 * documents.  Any Automerge mutation that a client makes against a document
 * from a retired epoch would be silently lost once the server applies the
 * cutover, so mutations must be blocked while a reload is in progress.
 *
 * This module tracks the epoch that was accepted at load time and exposes a
 * binary "mutation gate" that populateStore and socket helpers use to
 * coordinate the safety fence:
 *
 *   1. `closeMissionMutationGate()` is called just before fetching the
 *      resolved mission document URL, blocking all writes until the epoch
 *      is confirmed.
 *   2. `acceptMissionDatabaseEpoch()` is called once the server responds
 *      with a valid epoch/URL pair, recording the accepted values and
 *      reopening the gate.
 *   3. If a subsequent socket message carries a *different* epoch the gate
 *      is closed again (via `closeMissionMutationGate`) and the page is
 *      scheduled to reload — see `handleDatabaseEpoch` in clientSocketHelpers.
 */

let acceptedDatabaseEpoch: string | null = null;
let acceptedAutomergeUrl: string | null = null;
let mutationGateOpen = true;

/**
 * Records the database epoch and Automerge URL that were resolved at page
 * load, and reopens the mutation gate so writes may proceed.
 *
 * Called by `populateStore` after the server's `/resolve` endpoint confirms
 * that the mission document is from the current epoch.
 */
export const acceptMissionDatabaseEpoch = (databaseEpoch: string, automergeUrl: string): void => {
  acceptedDatabaseEpoch = databaseEpoch;
  acceptedAutomergeUrl = automergeUrl;
  mutationGateOpen = true;
};

/**
 * Closes the mutation gate, preventing any further Automerge writes.
 *
 * Called before a document-resolution fetch (to avoid a write racing with
 * the resolve response) and again when an epoch mismatch is detected on an
 * incoming socket message.
 */
export const closeMissionMutationGate = (): void => {
  mutationGateOpen = false;
};

/**
 * Returns `true` when the mutation gate is open and Automerge writes are
 * permitted.  Checked by `getMissionDocHandle`, `withMissionChange`, and
 * `withMissionOp` before proceeding.
 */
export const missionMutationIsAllowed = (): boolean => mutationGateOpen;

/**
 * Returns the database epoch and Automerge URL that were accepted at load
 * time.  Both values are `null` until `acceptMissionDatabaseEpoch` is called.
 * Used by socket helpers to detect whether the server has advanced to a new
 * epoch since the page was loaded.
 */
export const getAcceptedMissionDatabaseEpoch = (): {
  databaseEpoch: string | null;
  automergeUrl: string | null;
} => ({ databaseEpoch: acceptedDatabaseEpoch, automergeUrl: acceptedAutomergeUrl });
