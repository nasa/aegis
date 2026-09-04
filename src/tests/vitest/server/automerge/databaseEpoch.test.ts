import { parseDatabaseEpochState } from "server/automerge/databaseEpoch";

describe("database epoch state", () => {
  it("returns null until an active epoch has been registered", () => {
    expect(parseDatabaseEpochState(undefined)).toBeNull();
    expect(
      parseDatabaseEpochState({
        active_database_epoch: null,
        pending_database_epoch: "00000000-0000-4000-8000-000000000002",
        state: "preparing",
        reason: null,
      })
    ).toBeNull();
  });

  it("maps persisted operational state", () => {
    expect(
      parseDatabaseEpochState({
        active_database_epoch: "00000000-0000-4000-8000-000000000001",
        pending_database_epoch: null,
        state: "ready",
        reason: "complete",
      })
    ).toEqual({
      activeDatabaseEpoch: "00000000-0000-4000-8000-000000000001",
      pendingDatabaseEpoch: null,
      state: "ready",
      reason: "complete",
    });
  });
});
