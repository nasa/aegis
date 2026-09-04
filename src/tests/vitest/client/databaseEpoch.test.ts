import {
  acceptMissionDatabaseEpoch,
  closeMissionMutationGate,
  getAcceptedMissionDatabaseEpoch,
  missionMutationIsAllowed,
} from "client/databaseEpoch";

describe("database epoch mutation gate", () => {
  it("accepts a verified epoch and document", () => {
    acceptMissionDatabaseEpoch("epoch-a", "automerge:document-a");

    expect(missionMutationIsAllowed()).toBe(true);
    expect(getAcceptedMissionDatabaseEpoch()).toEqual({
      databaseEpoch: "epoch-a",
      automergeUrl: "automerge:document-a",
    });
  });

  it("blocks mutations without discarding the accepted identity", () => {
    acceptMissionDatabaseEpoch("epoch-a", "automerge:document-a");
    closeMissionMutationGate();

    expect(missionMutationIsAllowed()).toBe(false);
    expect(getAcceptedMissionDatabaseEpoch()).toEqual({
      databaseEpoch: "epoch-a",
      automergeUrl: "automerge:document-a",
    });
  });
});
