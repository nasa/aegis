import type { StoreType } from "store";
import {
  createTestStoreWithAutomergeMission,
  createCustomTestStore,
} from "tests/vitest/fixtures/store";
import {
  thunkDocAddStationToEva,
  thunkDocChangeIngressEgress,
  thunkDocChangeStationInEva,
  thunkDocCreateEva,
  thunkDocDeleteEva,
  thunkDocDeleteStationFromEva,
  thunkDocDuplicateEva,
  thunkDocReorderStationInEva,
  thunkUIChangeEvaDropdown,
  thunkUISetOnlyShowRunningRexEva,
} from "store/thunk/thunkEva";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { initialState as evaInitialState } from "store/eva";

const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => true);

// thunkFetchElevation always pretends to fail so the traverse path generation
// short-circuits in tests (we don't have a real elevation service).
const mockThunkFetchElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: () => mockThunkFetchElevation,
}));

// Spy on traverse update thunks. We don't care about the path math in these
// EVA tests, only that the right traverse-uuid get updated as expected.
const mockThunkDocUpdateTraverse = vi.fn();
const mockThunkDocUpdateTraversesAroundStation = vi.fn();
vi.mock("store/thunk/thunkTraverse", async () => {
  const actualModule = await vi.importActual("store/thunk/thunkTraverse");
  return {
    ...(actualModule as object),
    thunkDocUpdateTraverse: () => mockThunkDocUpdateTraverse,
    thunkDocUpdateTraversesAroundStation: () => mockThunkDocUpdateTraversesAroundStation,
  };
});

let store: StoreType;

beforeAll(() => {
  // Initialize the mocked mission Automerge doc handle. The vitest setup
  // mocks `setMissionAutomergeDocHandle` to create a blank mission on demand.
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  store = createTestStoreWithAutomergeMission();
});

afterAll(() => {
  vi.restoreAllMocks();
  confirmSpy.mockRestore();
  alertSpy.mockRestore();
});

/**
 * Helper: read the current mission doc out of the mocked Automerge handle.
 */
const getMission = (): Mission => getMissionDocHandle().doc();

describe("Thunk EVA Tests", () => {
  describe("thunkDocDeleteEva", () => {
    it("deletes a planned EVA with no attached rex (no rex side-effects)", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find((e) => e.name === "Vitest Eva-2 Planned No Rex");
      expect(eva).toBeDefined();

      const evaTraverseUuids = eva.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid);
      // Shared stations survive; the EVA's own lander stations do not.
      const evaStationUuids = eva.sequence
        .filter((s) => s.type === "station")
        .map((s) => s.uuid)
        .filter((uuid) => !mission.stations[uuid]?.isLanderXgress);
      const landerStationUuids = eva.sequence
        .filter((s) => s.type === "station")
        .map((s) => s.uuid)
        .filter((uuid) => mission.stations[uuid]?.isLanderXgress);

      await store.dispatch(thunkDocDeleteEva({ evaUuid: eva.uuid, forRex: false }));

      // The eva itself should be gone from the automerge doc
      expect(getMission().evas[eva.uuid]).toBeUndefined();

      // All of its traverses should also be gone
      for (const traverseUuid of evaTraverseUuids) {
        expect(getMission().traverses[traverseUuid]).toBeUndefined();
      }

      // Shared stations should NOT be deleted for a non-rex EVA delete.
      for (const stationUuid of evaStationUuids) {
        expect(getMission().stations[stationUuid]).toBeDefined();
      }

      // The lander station were owned by this EVA, so they go with it.
      expect(landerStationUuids.length).toBeGreaterThan(0);
      for (const stationUuid of landerStationUuids) {
        expect(getMission().stations[stationUuid]).toBeUndefined();
      }

      // Any actions whose traverseUuid pointed at the deleted traverses should
      // also have been removed when the traverses were deleted.
      const orphanTraverseActions = Object.values(getMission().actions).filter((a) =>
        evaTraverseUuids.includes(a.traverseUuid)
      );
      expect(orphanTraverseActions).toEqual([]);

      // Actions whose stationUuid pointed at the sequence stations should still
      // exist, because the stations themselves were NOT deleted.
      for (const stationUuid of evaStationUuids) {
        const stationActions = Object.values(getMission().actions).filter(
          (a) => a.stationUuid === stationUuid
        );
        // The station actions collection should be intact (defined entries, not empty
        // just because the station was removed).
        expect(getMission().stations[stationUuid]).toBeDefined();
        // Each station action should still be present in the doc.
        stationActions.forEach((a) => {
          expect(getMission().actions[a.uuid]).toBeDefined();
        });
      }
    });

    it("deletes a rex EVA and every station in its sequence, xgress stations included", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find((e) => e.name === "Vitest Eva-1 Rex Version");
      expect(eva).toBeDefined();

      const evaTraverseUuids = eva.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid);
      const evaStationUuids = eva.sequence.filter((s) => s.type === "station").map((s) => s.uuid);

      await store.dispatch(thunkDocDeleteEva({ evaUuid: eva.uuid, forRex: true }));

      // eva removed
      expect(getMission().evas[eva.uuid]).toBeUndefined();

      // traverses removed
      for (const traverseUuid of evaTraverseUuids) {
        expect(getMission().traverses[traverseUuid]).toBeUndefined();
      }

      // every station the REX EVA owned is removed, xgress stations included
      for (const stationUuid of evaStationUuids) {
        expect(getMission().stations[stationUuid]).toBeUndefined();
      }
    });

    it("deletes an as-planned EVA together with all rexes pointing at it", async () => {
      const mission = getMission();
      const asPlannedEvaWithRex = Object.values(mission.evas).find(
        (e) => e.name === "Vitest Eva-1 Planned with Rex"
      );
      expect(asPlannedEvaWithRex).toBeDefined();

      await store.dispatch(thunkDocDeleteEva({ evaUuid: asPlannedEvaWithRex.uuid, forRex: false }));

      // No remaining eva should share the original refUuid (as-planned + rex-evas
      // all get cleaned up because the rexes' evas are deleted recursively).
      const remainingMatching = Object.values(getMission().evas).filter(
        (e) => e.refUuid === asPlannedEvaWithRex.refUuid
      );
      expect(remainingMatching).toEqual([]);

      // No rex should still point at a missing eva uuid.
      const allEvaUuids = Object.keys(getMission().evas);
      const orphanRexes = Object.values(getMission().rexes).filter(
        (r) => !allEvaUuids.includes(r.evaUuid)
      );
      expect(orphanRexes).toEqual([]);
    });
  });

  describe("thunkDocCreateEva", () => {
    it("creates a new EVA and an associated initial traverse", async () => {
      const evaUuidsBefore = new Set(Object.keys(getMission().evas));
      const numTraversesBefore = Object.keys(getMission().traverses).length;
      const numEvasBefore = Object.keys(getMission().evas).length;

      await store.dispatch(thunkDocCreateEva());

      expect(Object.keys(getMission().traverses).length).toEqual(numTraversesBefore + 1);
      expect(Object.keys(getMission().evas).length).toEqual(numEvasBefore + 1);

      // The new EVA should have exactly one traverse in its sequence.
      const newEva = Object.values(getMission().evas).find((e) => !evaUuidsBefore.has(e.uuid));
      expect(newEva).toBeDefined();
      expect(newEva.sequence.filter((s) => s.type === "traverse")).toHaveLength(1);
    });

    it("selects the new EVA in Redux state after creation", async () => {
      const evaUuidsBefore = new Set(Object.keys(getMission().evas));

      await store.dispatch(thunkDocCreateEva());

      const newEva = Object.values(getMission().evas).find((e) => !evaUuidsBefore.has(e.uuid));
      expect(newEva).toBeDefined();
      expect(store.getState().eva.selectedEvaUuid).toEqual(newEva.uuid);
    });

    it("generates a unique name when EVAs already exist", async () => {
      await store.dispatch(thunkDocCreateEva());
      await store.dispatch(thunkDocCreateEva());

      const allEvas = Object.values(getMission().evas);
      const evaNames = allEvas.map((e) => e.name);
      const uniqueNames = new Set(evaNames);
      // All EVA names should be unique (no duplicates across the whole mission)
      expect(uniqueNames.size).toEqual(evaNames.length);
    });

    it("calls thunkFetchElevation for the initial traverse", async () => {
      await store.dispatch(thunkDocCreateEva());

      expect(mockThunkFetchElevation).toHaveBeenCalledTimes(1);
    });

    it("new EVA uses mission traverseRate and defaultEvaDuration", async () => {
      const mission = getMission();
      const evaUuidsBefore = new Set(Object.keys(mission.evas));

      await store.dispatch(thunkDocCreateEva());

      const newEva = Object.values(getMission().evas).find((e) => !evaUuidsBefore.has(e.uuid));
      expect(newEva).toBeDefined();
      expect(newEva.traverseRate).toEqual(mission.traverseRate);
      expect(newEva.duration).toEqual(mission.defaultEvaDuration);
    });
  });

  describe("thunkDocDuplicateEva", () => {
    it("duplicates an EVA without stations (traverses + lander stations cloned)", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find((e) => e.name === "Vitest Eva-2 Planned No Rex");

      const numTraversesInEva = eva.sequence.filter((s) => s.type === "traverse").length;
      // Lander stations are owned by one EVA, so they are copied even when the
      // user opts out of duplicating stations.
      const numLanderStationsInEva = eva.sequence.filter(
        (s) => s.type === "station" && mission.stations[s.uuid]?.isLanderXgress
      ).length;
      const numEvasBefore = Object.keys(getMission().evas).length;
      const numTraversesBefore = Object.keys(getMission().traverses).length;
      const numStationsBefore = Object.keys(getMission().stations).length;

      await store.dispatch(
        thunkDocDuplicateEva({ evaUuid: eva.uuid, includeStations: false, isRexEva: false })
      );

      expect(Object.keys(getMission().evas).length).toEqual(numEvasBefore + 1);
      expect(Object.keys(getMission().traverses).length).toEqual(
        numTraversesBefore + numTraversesInEva
      );
      expect(numLanderStationsInEva).toBe(2);
      expect(Object.keys(getMission().stations).length).toEqual(
        numStationsBefore + numLanderStationsInEva
      );
    });

    it("duplicates an EVA with stations (stations + traverses all cloned)", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find((e) => e.name === "Vitest Eva-2 Planned No Rex");

      const numTraversesInEva = eva.sequence.filter((s) => s.type === "traverse").length;
      const numStationsInEva = eva.sequence.filter((s) => s.type === "station").length;
      const numEvasBefore = Object.keys(getMission().evas).length;
      const numTraversesBefore = Object.keys(getMission().traverses).length;
      const numStationsBefore = Object.keys(getMission().stations).length;

      await store.dispatch(
        thunkDocDuplicateEva({ evaUuid: eva.uuid, includeStations: true, isRexEva: false })
      );

      expect(Object.keys(getMission().evas).length).toEqual(numEvasBefore + 1);
      expect(Object.keys(getMission().traverses).length).toEqual(
        numTraversesBefore + numTraversesInEva
      );
      expect(Object.keys(getMission().stations).length).toEqual(
        numStationsBefore + numStationsInEva
      );
    });

    it("duplicates an EVA for REX (all sequence stations cloned, new EVA has blank name)", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find(
        (e) => e.name === "Vitest Eva-1 Planned with Rex"
      );

      const numTraversesInEva = eva.sequence.filter((s) => s.type === "traverse").length;
      const numStationsInEva = eva.sequence.filter((s) => s.type === "station").length;
      const numEvasBefore = Object.keys(getMission().evas).length;
      const numTraversesBefore = Object.keys(getMission().traverses).length;
      const numStationsBefore = Object.keys(getMission().stations).length;

      const res = await store.dispatch(
        thunkDocDuplicateEva({ evaUuid: eva.uuid, includeStations: true, isRexEva: true })
      );

      expect(Object.keys(getMission().evas).length).toEqual(numEvasBefore + 1);
      expect(res.payload).toBeTruthy();
      if (!res.payload) throw new Error("thunkDocDuplicateEva returned no payload");
      // For rex evas the name is blank
      const newEva = getMission().evas[res.payload.uuid];
      expect(newEva.name).toBe("");

      expect(Object.keys(getMission().traverses).length).toEqual(
        numTraversesBefore + numTraversesInEva
      );
      expect(Object.keys(getMission().stations).length).toEqual(
        numStationsBefore + numStationsInEva
      );
    });
  });

  describe("Sequence Tests", () => {
    describe("thunkDocAddStationToEva", () => {
      it("adds an empty station and a new traverse to the sequence", async () => {
        const eva = Object.values(getMission().evas)[0];
        const evaSequenceCount = eva.sequence.length;
        const traverseCount = Object.keys(getMission().traverses).length;

        await store.dispatch(thunkDocAddStationToEva({ evaUuid: eva.uuid }));

        expect(Object.keys(getMission().traverses).length).toEqual(traverseCount + 1);
        expect(getMission().evas[eva.uuid].sequence.length).toEqual(evaSequenceCount + 2);
      });
    });

    describe("thunkDocDeleteStationFromEva", () => {
      // Sequence: [egress, t, s, t, s, t, s, t, ingress] — removable stations
      // sit at indices 2, 4 and 6.
      const findEvaWithThreeStations = () =>
        Object.values(getMission().evas).find((e) => e.sequence.length === 9);

      it("removes the first removable station + its trailing traverse", async () => {
        const eva = findEvaWithThreeStations();
        const evaSequence = eva.sequence;
        const traverseCount = Object.keys(getMission().traverses).length;

        await store.dispatch(
          thunkDocDeleteStationFromEva({
            evaSequence,
            sequenceIndex: 2,
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );

        const newSequence = getMission().evas[eva.uuid].sequence;
        expect(newSequence.length).toEqual(evaSequence.length - 2);
        expect(Object.keys(getMission().traverses).length).toEqual(traverseCount - 1);
        expect(mockThunkFetchElevation).toHaveBeenCalledTimes(1);
      });

      it("removes a middle station + a surrounding traverse", async () => {
        const eva = findEvaWithThreeStations();
        const evaSequence = eva.sequence;
        const traverseCount = Object.keys(getMission().traverses).length;

        await store.dispatch(
          thunkDocDeleteStationFromEva({
            evaSequence,
            sequenceIndex: 4,
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );

        const newSequence = getMission().evas[eva.uuid].sequence;
        expect(newSequence.length).toEqual(evaSequence.length - 2);
        expect(Object.keys(getMission().traverses).length).toEqual(traverseCount - 1);
        expect(mockThunkFetchElevation).toHaveBeenCalledTimes(1);
      });

      it("removes the last removable station + its trailing traverse", async () => {
        const eva = findEvaWithThreeStations();
        const evaSequence = eva.sequence;
        const traverseCount = Object.keys(getMission().traverses).length;

        await store.dispatch(
          thunkDocDeleteStationFromEva({
            evaSequence,
            sequenceIndex: 6,
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );

        const newSequence = getMission().evas[eva.uuid].sequence;
        expect(newSequence.length).toEqual(evaSequence.length - 2);
        expect(Object.keys(getMission().traverses).length).toEqual(traverseCount - 1);
        expect(mockThunkFetchElevation).toHaveBeenCalledTimes(1);
      });

      it("leaves the pinned egress and ingress stations in place", async () => {
        const eva = findEvaWithThreeStations();
        const evaSequence = eva.sequence;
        const egressUuid = evaSequence[0].uuid;
        const ingressUuid = evaSequence[evaSequence.length - 1].uuid;

        await store.dispatch(
          thunkDocDeleteStationFromEva({
            evaSequence,
            sequenceIndex: 2,
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );

        const newSequence = getMission().evas[eva.uuid].sequence;
        expect(newSequence[0].uuid).toEqual(egressUuid);
        expect(newSequence[newSequence.length - 1].uuid).toEqual(ingressUuid);
      });

      it("(isRexEva=true) deletes the station record before removing it from the sequence", async () => {
        const eva = findEvaWithThreeStations();
        const evaSequence = eva.sequence;
        const stationUuidToDelete = evaSequence[2].uuid;
        const stationsBefore = Object.keys(getMission().stations).length;

        await store.dispatch(
          thunkDocDeleteStationFromEva({
            evaSequence,
            sequenceIndex: 2,
            evaUuid: eva.uuid,
            isRexEva: true,
          })
        );

        const newSequence = getMission().evas[eva.uuid].sequence;
        expect(newSequence.length).toEqual(evaSequence.length - 2);
        // The station record must have been deleted from the doc
        expect(getMission().stations[stationUuidToDelete]).toBeUndefined();
        expect(Object.keys(getMission().stations).length).toEqual(stationsBefore - 1);
      });
    });

    describe("thunkDocChangeStationInEva", () => {
      it("swaps the station uuid in the sequence (non-rex)", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-2 Planned No Rex"
        );
        const numStationsBefore = Object.keys(getMission().stations).length;
        const stationNotInEva = Object.values(getMission().stations).find(
          (s) =>
            !eva.sequence
              .filter((seq) => seq.type === "station")
              .map((seq) => seq.uuid)
              .includes(s.uuid)
        );

        await store.dispatch(
          thunkDocChangeStationInEva({
            sequenceIndex: 2,
            newStationUuid: stationNotInEva.uuid,
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );

        const updatedEva = getMission().evas[eva.uuid];
        expect(updatedEva.sequence[2].uuid).toEqual(stationNotInEva.uuid);
        // No duplication for non-rex
        expect(Object.keys(getMission().stations).length).toEqual(numStationsBefore);
        expect(mockThunkFetchElevation).toHaveBeenCalledTimes(2);
      });

      it("duplicates the new station and deletes the old one (rex)", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-1 Rex Version"
        );
        const numStationsBefore = Object.keys(getMission().stations).length;
        const stationNotInEva = Object.values(getMission().stations).find(
          (s) =>
            !eva.sequence
              .filter((seq) => seq.type === "station")
              .map((seq) => seq.uuid)
              .includes(s.uuid)
        );
        const oldStationUuid = eva.sequence[2].uuid;

        await store.dispatch(
          thunkDocChangeStationInEva({
            sequenceIndex: 2,
            newStationUuid: stationNotInEva.uuid,
            oldStationUuid,
            evaUuid: eva.uuid,
            isRexEva: true,
          })
        );

        const newSequence = getMission().evas[eva.uuid].sequence;
        // The new sequence position no longer points at the original new station — it
        // points at the duplicate that was created for the rex.
        expect(newSequence[2].uuid).not.toEqual(stationNotInEva.uuid);
        // Old station deleted, new one duplicated -> net zero change in station count
        expect(Object.keys(getMission().stations).length).toEqual(numStationsBefore);
        // Old station removed from doc
        expect(getMission().stations[oldStationUuid]).toBeUndefined();
        expect(mockThunkFetchElevation).toHaveBeenCalledTimes(2);
      });
    });

    describe("thunkDocReorderStationInEva", () => {
      it("swaps two stations and updates the traverses around them", async () => {
        const eva = Object.values(getMission().evas).find((e) => e.sequence.length === 9);
        const originalSequence = [...eva.sequence];

        await store.dispatch(
          thunkDocReorderStationInEva({
            direction: "up",
            evaSequence: eva.sequence,
            stationIndex: 4,
            evaUuid: eva.uuid,
          })
        );

        const updatedSequence = getMission().evas[eva.uuid].sequence;
        expect(updatedSequence[2].uuid).toEqual(originalSequence[4].uuid);
        expect(updatedSequence[4].uuid).toEqual(originalSequence[2].uuid);
        expect(mockThunkFetchElevation).toHaveBeenCalledTimes(3);
      });

      it("refuses to move a station into a pinned xgress position", async () => {
        const eva = Object.values(getMission().evas).find((e) => e.sequence.length === 9);
        const originalSequence = [...eva.sequence];

        // Index 2 is the first movable station; moving it up would displace egress.
        await store.dispatch(
          thunkDocReorderStationInEva({
            direction: "up",
            evaSequence: eva.sequence,
            stationIndex: 2,
            evaUuid: eva.uuid,
          })
        );

        const updatedSequence = getMission().evas[eva.uuid].sequence;
        expect(updatedSequence.map((i) => i.uuid)).toEqual(originalSequence.map((i) => i.uuid));
      });
    });

    describe("thunkDocChangeIngressEgress", () => {
      const xgressStationUuid = (evaUuid: string, role: "egress" | "ingress"): string => {
        const sequence = getMission().evas[evaUuid].sequence;
        return role === "egress" ? sequence[0].uuid : sequence[sequence.length - 1].uuid;
      };

      it("(isRexEva=false) points the position at the chosen station and drops the lander station", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-2 Planned No Rex"
        );
        const stationNotInEva = Object.values(getMission().stations).find(
          (s) => !eva.sequence.map((seq) => seq.uuid).includes(s.uuid) && !s.isLanderXgress
        );
        const oldIngressUuid = xgressStationUuid(eva.uuid, "ingress");

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "ingress",
            newStationUuidOrLander: stationNotInEva.uuid,
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );

        // The position now holds the chosen station itself — no copy is made.
        expect(xgressStationUuid(eva.uuid, "ingress")).toEqual(stationNotInEva.uuid);
        // The lander station it replaced was owned by the EVA, so it is gone.
        expect(getMission().stations[oldIngressUuid]).toBeUndefined();
        expect(mockThunkFetchElevation).toHaveBeenCalledTimes(1);
      });

      it("(isRexEva=false) switching back to the lander creates a fresh lander station", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-2 Planned No Rex"
        );
        const stationNotInEva = Object.values(getMission().stations).find(
          (s) => !eva.sequence.map((seq) => seq.uuid).includes(s.uuid) && !s.isLanderXgress
        );

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "egress",
            newStationUuidOrLander: stationNotInEva.uuid,
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );
        expect(xgressStationUuid(eva.uuid, "egress")).toEqual(stationNotInEva.uuid);

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "egress",
            newStationUuidOrLander: "lander",
            evaUuid: eva.uuid,
            isRexEva: false,
          })
        );

        const newEgress = getMission().stations[xgressStationUuid(eva.uuid, "egress")];
        expect(newEgress.isLanderXgress).toBe(true);
        // The shared station is not owned by the EVA, so it survives.
        expect(getMission().stations[stationNotInEva.uuid]).toBeDefined();
      });

      it("(isRexEva=true) duplicates the new station and deletes the old one for ingress", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-1 Rex Version"
        );
        const newIngressStation = Object.values(getMission().stations).find(
          (s) => !eva.sequence.map((seq) => seq.uuid).includes(s.uuid) && !s.isLanderXgress
        );
        const oldIngressUuid = xgressStationUuid(eva.uuid, "ingress");
        const stationsBefore = Object.keys(getMission().stations).length;

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "ingress",
            evaUuid: eva.uuid,
            newStationUuidOrLander: newIngressStation.uuid,
            isRexEva: true,
          })
        );

        // The REX EVA owned the outgoing station, so it is deleted...
        expect(getMission().stations[oldIngressUuid]).toBeUndefined();
        // ...and replaced by a private copy of the chosen station (net zero).
        expect(Object.keys(getMission().stations).length).toEqual(stationsBefore);
        const slotUuid = xgressStationUuid(eva.uuid, "ingress");
        expect(slotUuid).not.toEqual(newIngressStation.uuid);
        expect(slotUuid).not.toEqual(oldIngressUuid);
        expect(getMission().stations[newIngressStation.uuid]).toBeDefined();
      });

      it("(isRexEva=true) duplicates the new station and deletes the old one for egress", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-1 Rex Version"
        );
        const newEgressStation = Object.values(getMission().stations).find(
          (s) => !eva.sequence.map((seq) => seq.uuid).includes(s.uuid) && !s.isLanderXgress
        );
        const oldEgressUuid = xgressStationUuid(eva.uuid, "egress");
        const stationsBefore = Object.keys(getMission().stations).length;

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "egress",
            evaUuid: eva.uuid,
            newStationUuidOrLander: newEgressStation.uuid,
            isRexEva: true,
          })
        );

        expect(getMission().stations[oldEgressUuid]).toBeUndefined();
        expect(Object.keys(getMission().stations).length).toEqual(stationsBefore);
        const slotUuid = xgressStationUuid(eva.uuid, "egress");
        expect(slotUuid).not.toEqual(newEgressStation.uuid);
        expect(slotUuid).not.toEqual(oldEgressUuid);
      });

      it("is a no-op when the position already holds the requested location", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-1 Rex Version"
        );
        // Put a lander copy in the ingress position.
        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "ingress",
            evaUuid: eva.uuid,
            newStationUuidOrLander: "lander",
            isRexEva: true,
          })
        );
        const stationsBefore = Object.keys(getMission().stations).length;
        const slotBefore = xgressStationUuid(eva.uuid, "ingress");

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "ingress",
            evaUuid: eva.uuid,
            newStationUuidOrLander: "lander",
            isRexEva: true,
          })
        );

        expect(Object.keys(getMission().stations).length).toEqual(stationsBefore);
        expect(xgressStationUuid(eva.uuid, "ingress")).toEqual(slotBefore);
      });

      it("(isRexEva=true) switching to the lander deletes the old station and its actions", async () => {
        const eva = Object.values(getMission().evas).find(
          (e) => e.name === "Vitest Eva-1 Rex Version"
        );
        const stationNotInEva = Object.values(getMission().stations).find(
          (s) => !eva.sequence.map((seq) => seq.uuid).includes(s.uuid) && !s.isLanderXgress
        );

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "ingress",
            evaUuid: eva.uuid,
            newStationUuidOrLander: stationNotInEva.uuid,
            isRexEva: true,
          })
        );
        const copiedStationUuid = xgressStationUuid(eva.uuid, "ingress");
        const stationsBefore = Object.keys(getMission().stations).length;

        await store.dispatch(
          thunkDocChangeIngressEgress({
            type: "ingress",
            evaUuid: eva.uuid,
            newStationUuidOrLander: "lander",
            isRexEva: true,
          })
        );

        // The REX's private copy is deleted and a lander station takes its
        // place, so the station count is unchanged.
        expect(getMission().stations[copiedStationUuid]).toBeUndefined();
        expect(Object.keys(getMission().stations).length).toEqual(stationsBefore);
        expect(getMission().stations[xgressStationUuid(eva.uuid, "ingress")].isLanderXgress).toBe(
          true
        );
      });
    });
  });

  describe("thunkUIChangeEvaDropdown", () => {
    it("selects the given eva uuid and sets the dropdown UI state", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find(
        (e) => e.name === "Vitest Eva-1 Planned with Rex"
      );

      await store.dispatch(
        thunkUIChangeEvaDropdown({
          dropdownEvaUuid: eva.uuid,
          asPlanedEvaUuid: eva.uuid,
        })
      );

      const evaState = store.getState().eva;
      expect(evaState.selectedEvaUuid).toEqual(eva.uuid);
      expect(evaState.evaDropdownUIStates[eva.uuid]).toEqual(eva.uuid);
      expect(evaState.selectedEvaSequenceItemUuid).toBeNull();
      // No rex found for this eva uuid, so selectedRexUuid should be null
      expect(store.getState().rex.selectedRexUuid).toBeNull();
    });

    it("sets selectedRexUuid when the dropdown eva belongs to a rex", async () => {
      const mission = getMission();
      const rexEva = Object.values(mission.evas).find((e) => e.name === "Vitest Eva-1 Rex Version");
      const rex = Object.values(mission.rexes)[0];
      // rex1.evaUuid should point at the rexEva
      expect(rex.evaUuid).toEqual(rexEva.uuid);

      const asPlannedEva = Object.values(mission.evas).find(
        (e) => e.name === "Vitest Eva-1 Planned with Rex"
      );

      await store.dispatch(
        thunkUIChangeEvaDropdown({
          dropdownEvaUuid: rexEva.uuid,
          asPlanedEvaUuid: asPlannedEva.uuid,
        })
      );

      expect(store.getState().eva.selectedEvaUuid).toEqual(rexEva.uuid);
      expect(store.getState().eva.evaDropdownUIStates[asPlannedEva.uuid]).toEqual(rexEva.uuid);
      expect(store.getState().rex.selectedRexUuid).toEqual(rex.uuid);
    });

    it("resets selectedEvaRightNavItem to info_panel when currently on a rex tab and selects as planned eva", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find((e) => e.name === "Vitest Eva-2 Planned No Rex");

      // Create a store with the right nav item set to a rex tab
      store = createCustomTestStore({
        eva: {
          ...evaInitialState,
          selectedEvaRightNavItem: "rex_some_tab",
        },
      });

      await store.dispatch(
        thunkUIChangeEvaDropdown({
          dropdownEvaUuid: eva.uuid,
          asPlanedEvaUuid: eva.uuid,
        })
      );

      // No rex found for this eva, so the rex tab should be reset to info_panel
      expect(store.getState().eva.selectedEvaRightNavItem).toEqual("info_panel");
    });

    it("does NOT reset selectedEvaRightNavItem when currently on a non-rex tab and select as planned eva", async () => {
      const mission = getMission();
      const eva = Object.values(mission.evas).find((e) => e.name === "Vitest Eva-2 Planned No Rex");

      store = createCustomTestStore({
        eva: {
          ...evaInitialState,
          selectedEvaRightNavItem: "some_non_rex_tab",
        },
      });

      await store.dispatch(
        thunkUIChangeEvaDropdown({
          dropdownEvaUuid: eva.uuid,
          asPlanedEvaUuid: eva.uuid,
        })
      );

      expect(store.getState().eva.selectedEvaRightNavItem).toEqual("some_non_rex_tab");
    });
  });

  describe("thunkUISetOnlyShowRunningRexEva", () => {
    it("sets showRunningRexOnly=false without changing selection", async () => {
      const evaUuidBefore = store.getState().eva.selectedEvaUuid;

      await store.dispatch(thunkUISetOnlyShowRunningRexEva({ show: false }));

      expect(store.getState().eva.showRunningRexOnly).toBe(false);
      // No selection changes when toggling off
      expect(store.getState().eva.selectedEvaUuid).toEqual(evaUuidBefore);
    });

    it("sets showRunningRexOnly=true and selects the running rex when one exists", async () => {
      const mission = getMission();
      const rex = Object.values(mission.rexes)[0];

      // Mark the rex as running
      getMissionDocHandle().change((m: Mission) => {
        m.rexes[rex.uuid].isRunning = true;
      });

      await store.dispatch(thunkUISetOnlyShowRunningRexEva({ show: true }));

      expect(store.getState().eva.showRunningRexOnly).toBe(true);
      // Should have selected the running rex's eva and the rex itself
      const runningRex = Object.values(getMission().rexes).find((r) => r.isRunning);
      expect(store.getState().eva.selectedEvaUuid).toEqual(runningRex.evaUuid);
      expect(store.getState().rex.selectedRexUuid).toEqual(runningRex.uuid);

      // Cleanup: reset isRunning
      getMissionDocHandle().change((m: Mission) => {
        m.rexes[rex.uuid].isRunning = false;
      });
    });

    it("sets showRunningRexOnly=true but does nothing when no rex is running", async () => {
      // Ensure no rex is marked as running (the fixture default is isRunning=false)
      const allRexes = Object.values(getMission().rexes);
      allRexes.forEach((r) => {
        getMissionDocHandle().change((m: Mission) => {
          m.rexes[r.uuid].isRunning = false;
        });
      });

      const evaUuidBefore = store.getState().eva.selectedEvaUuid;

      await store.dispatch(thunkUISetOnlyShowRunningRexEva({ show: true }));

      expect(store.getState().eva.showRunningRexOnly).toBe(true);
      // No running rex → selection should remain unchanged (early return)
      expect(store.getState().eva.selectedEvaUuid).toEqual(evaUuidBefore);
    });
  });
});
