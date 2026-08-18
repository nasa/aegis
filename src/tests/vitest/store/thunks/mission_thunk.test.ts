import type { StoreType } from "store";
import { thunkDocUpdateLanderLocation } from "store/thunk/thunkMission";
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";

const makeLanderStation = (location: AEGISPoint): Station =>
  generateBlankStation({ name: "Lander", isLanderXgress: true, location: { ...location } });

const mockThunkFetchElevation = vi.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
// thunkGetElevation is the outer factory — spy on it so mock.calls captures
// the { path, pathSegmentDistances, uuid } args passed to the factory.
// The factory returns mockThunkFetchElevation which the store dispatches.
const mockThunkFetchElevationFactory = vi.fn((..._args) => mockThunkFetchElevation);
vi.mock("store/thunk/thunkElevation", () => ({
  thunkFetchElevation: (...args: unknown[]) => mockThunkFetchElevationFactory(...args),
}));

const getMission = (): Mission => getMissionDocHandle().doc();

let store: StoreType;

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  store = createTestStoreWithAutomergeMission();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Mission Tests", () => {
  describe("thunkDocUpdateLanderLocation", () => {
    it("updates lander, station walkbacks, and lander-touching traverses", async () => {
      const newLanderLoc: AEGISPoint = { lat: 1.1, lng: 1.1 };

      // Pre-populate some stations with locations + walkback paths so the thunk
      // has data to operate on. The seeded mission's stations have no walkback
      // yet, so we need to seed at least one with a path + a non-null location.
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m: Mission) => {
        const stations = Object.values(m.stations);
        for (const s of stations) {
          // Lander stations move with the lander and never get a walkback.
          if (s.location && !s.isLanderXgress) {
            // Spread proxy refs into plain objects — assigning a live Automerge
            // proxy directly into an array inside .change() throws
            // "cannot create a reference to an existing document object".
            s.walkbackPath = [{ ...s.location }, { ...m.landerLocation }];
          }
        }
      });

      await store.dispatch(thunkDocUpdateLanderLocation({ location: newLanderLoc }));

      // lander itself updated on the automerge doc
      expect(getMission().landerLocation).toEqual(newLanderLoc);
      expect(mockThunkFetchElevationFactory).toHaveBeenCalled();

      // All stations with a walkback path should have the lander endpoint snapped
      // to the new lander location.
      const stationsWithWalkback = Object.values(getMission().stations).filter(
        (s) => s.walkbackPath && s.walkbackPath.length > 0
      );
      expect(stationsWithWalkback.length).toBeGreaterThan(0);
      for (const s of stationsWithWalkback) {
        expect(s.walkbackPath[s.walkbackPath.length - 1]).toEqual(newLanderLoc);
      }

      // Every lander station moves with the lander.
      const landerStations = Object.values(getMission().stations).filter((s) => s.isLanderXgress);
      expect(landerStations.length).toBeGreaterThan(0);
      for (const s of landerStations) {
        expect(s.location).toEqual(newLanderLoc);
      }

      // EVAs egressing at the lander: their first traverse starts at the new
      // lander location.
      const evaFromLander = Object.values(getMission().evas).find(
        (e) => e.egressLocationUuid === "lander" && e.sequence.length > 0
      );
      if (evaFromLander) {
        const traverseFromLander = getMission().traverses[evaFromLander.sequence[1].uuid];
        expect(traverseFromLander.path[0]).toEqual(newLanderLoc);
      } else {
        // Fail test, this case did not run
        expect.fail("No EVA with lander egress — lander traverse assertion did not run");
      }

      // EVAs ingressing at the lander: their last traverse ends at the new
      // lander location.
      const evaToLander = Object.values(getMission().evas).find(
        (e) => e.ingressLocationUuid === "lander" && e.sequence.length > 0
      );
      if (evaToLander) {
        const lastTraverseSeq = evaToLander.sequence[evaToLander.sequence.length - 2];
        const traverseToLander = getMission().traverses[lastTraverseSeq.uuid];
        expect(traverseToLander.path[traverseToLander.path.length - 1]).toEqual(newLanderLoc);
      } else {
        // Fail test, this case did not run
        expect.fail("No EVA with lander ingress found — lander traverse assertion did not run");
      }
    });

    it("stores landerElevationMeters when elevation lookup succeeds", async () => {
      mockThunkFetchElevation.mockReturnValueOnce({
        meta: { requestStatus: "fulfilled" },
        payload: 4321,
      });
      const newLanderLoc: AEGISPoint = { lat: 9.9, lng: 8.8 };

      await store.dispatch(thunkDocUpdateLanderLocation({ location: newLanderLoc }));

      expect(getMission().landerLocation).toEqual(newLanderLoc);
      expect(getMission().landerElevationMeters).toBe(4321);
    });

    it("skips stations that have no location set", async () => {
      // Clear locations on all stations
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m: Mission) => {
        for (const s of Object.values(m.stations)) {
          s.location = null;
          s.walkbackPath = null;
        }
      });

      const newLanderLoc: AEGISPoint = { lat: 50, lng: 50 };
      // Should not throw — every station's location is null, so walkback updates
      // are short-circuited.
      await expect(
        store.dispatch(thunkDocUpdateLanderLocation({ location: newLanderLoc }))
      ).resolves.not.toThrow();
      expect(getMission().landerLocation).toEqual(newLanderLoc);
    });

    it("snaps egress traverse START to the NEW lander location, not the old one", async () => {
      // Regression: the original implementation called stageTraverseUpdate which
      // resolved the lander endpoint from mission.landerLocation (the OLD value).
      // The elevation was then fetched for the wrong path. This test asserts that
      // path[0] of an egress traverse equals the NEW lander location.
      const missionDocHandle = getMissionDocHandle();
      const oldLanderLoc: AEGISPoint = { lat: 0, lng: 0 };
      const newLanderLoc: AEGISPoint = { lat: 99, lng: 99 };

      // Build an EVA with lander egress and a multi-point traverse path whose
      // first point is still the OLD lander location.
      const traverse = generateBlankTraverse({ name: "Egress Traverse" });
      const midpoint: AEGISPoint = { lat: 10, lng: 10 };
      traverse.path = [{ ...oldLanderLoc }, { ...midpoint }, { lat: 20, lng: 20 }];

      const egressStation = makeLanderStation(oldLanderLoc);
      const ingressStation = makeLanderStation(oldLanderLoc);
      const eva = generateBlankEVA({
        name: "Lander Egress EVA",
        sequence: [
          { uuid: egressStation.uuid, type: "station" },
          { uuid: traverse.uuid, type: "traverse" },
          { uuid: ingressStation.uuid, type: "station" },
        ],
      });

      missionDocHandle.change((m: Mission) => {
        m.landerLocation = { ...oldLanderLoc };
        m.traverses[traverse.uuid] = { ...traverse };
        m.stations[egressStation.uuid] = { ...egressStation };
        m.stations[ingressStation.uuid] = { ...ingressStation };
        m.evas[eva.uuid] = { ...eva };
      });

      await store.dispatch(thunkDocUpdateLanderLocation({ location: newLanderLoc }));

      const updatedTraverse = getMission().traverses[traverse.uuid];
      // First point must be the NEW lander, not the old one
      expect(updatedTraverse.path[0]).toEqual(newLanderLoc);
      // The midpoint interior segment must be preserved
      expect(updatedTraverse.path[1]).toEqual(midpoint);
    });

    it("snaps ingress traverse END to the NEW lander location, not the old one", async () => {
      // Mirrors the egress regression test for the ingress (last traverse) case.
      const missionDocHandle = getMissionDocHandle();
      const oldLanderLoc: AEGISPoint = { lat: 0, lng: 0 };
      const newLanderLoc: AEGISPoint = { lat: 77, lng: 77 };

      const traverse = generateBlankTraverse({ name: "Ingress Traverse" });
      const midpoint: AEGISPoint = { lat: 5, lng: 5 };
      traverse.path = [{ lat: 20, lng: 20 }, { ...midpoint }, { ...oldLanderLoc }];

      const egressStation = makeLanderStation(oldLanderLoc);
      const ingressStation = makeLanderStation(oldLanderLoc);
      const eva = generateBlankEVA({
        name: "Lander Ingress EVA",
        sequence: [
          { uuid: egressStation.uuid, type: "station" },
          { uuid: traverse.uuid, type: "traverse" },
          { uuid: ingressStation.uuid, type: "station" },
        ],
      });

      missionDocHandle.change((m: Mission) => {
        m.landerLocation = { ...oldLanderLoc };
        m.traverses[traverse.uuid] = { ...traverse };
        m.stations[egressStation.uuid] = { ...egressStation };
        m.stations[ingressStation.uuid] = { ...ingressStation };
        m.evas[eva.uuid] = { ...eva };
      });

      await store.dispatch(thunkDocUpdateLanderLocation({ location: newLanderLoc }));

      const updatedTraverse = getMission().traverses[traverse.uuid];
      // Last point must be the NEW lander
      expect(updatedTraverse.path[updatedTraverse.path.length - 1]).toEqual(newLanderLoc);
      // The midpoint interior segment must be preserved
      expect(updatedTraverse.path[1]).toEqual(midpoint);
    });

    it("deduplicates traverses shared across multiple EVAs", async () => {
      // Two EVAs referencing the same traverse uuid (both with lander egress+ingress)
      // should stage that traverse exactly once. If it were applied twice, the
      // applyTraverseUpdatesStage loop would run twice and `updatedAt` would be
      // written twice — which we can observe indirectly. More importantly we
      // assert the geometry is correct: both endpoints must equal newLanderLoc
      // (since it is simultaneously the start and end of a single-traverse EVA),
      // and the interior midpoint must be preserved untouched.
      const missionDocHandle = getMissionDocHandle();
      const oldLanderLoc: AEGISPoint = { lat: 0, lng: 0 };
      const newLanderLoc: AEGISPoint = { lat: 55, lng: 55 };
      const midpoint: AEGISPoint = { lat: 10, lng: 10 };

      const sharedTraverse = generateBlankTraverse({ name: "Shared Traverse" });
      sharedTraverse.path = [{ ...oldLanderLoc }, { ...midpoint }, { ...oldLanderLoc }];

      const evaAEgress = makeLanderStation(oldLanderLoc);
      const evaAIngress = makeLanderStation(oldLanderLoc);
      const evaBEgress = makeLanderStation(oldLanderLoc);
      const evaBIngress = makeLanderStation(oldLanderLoc);
      const evaA = generateBlankEVA({
        sequence: [
          { uuid: evaAEgress.uuid, type: "station" },
          { uuid: sharedTraverse.uuid, type: "traverse" },
          { uuid: evaAIngress.uuid, type: "station" },
        ],
      });
      const evaB = generateBlankEVA({
        sequence: [
          { uuid: evaBEgress.uuid, type: "station" },
          { uuid: sharedTraverse.uuid, type: "traverse" },
          { uuid: evaBIngress.uuid, type: "station" },
        ],
      });

      missionDocHandle.change((m: Mission) => {
        m.landerLocation = { ...oldLanderLoc };
        m.traverses[sharedTraverse.uuid] = { ...sharedTraverse };
        for (const s of [evaAEgress, evaAIngress, evaBEgress, evaBIngress]) {
          m.stations[s.uuid] = { ...s };
        }
        m.evas[evaA.uuid] = { ...evaA };
        m.evas[evaB.uuid] = { ...evaB };
      });

      await store.dispatch(thunkDocUpdateLanderLocation({ location: newLanderLoc }));

      const updated = getMission().traverses[sharedTraverse.uuid];
      // Both endpoints must be the new lander location
      expect(updated.path[0]).toEqual(newLanderLoc);
      expect(updated.path[updated.path.length - 1]).toEqual(newLanderLoc);
      // Interior midpoint must be untouched — if the traverse were applied twice
      // the second pass would overwrite with a path snapped from a stale clone,
      // potentially corrupting the midpoint.
      expect(updated.path[1]).toEqual(midpoint);
      // Exactly one elevation fetch must have been dispatched for this traverse uuid
      // (not two — one per EVA). mockThunkFetchElevationFactory records the args
      // passed to thunkFetchElevation(), including the uuid field.
      const elevCallsForTraverse = mockThunkFetchElevationFactory.mock.calls.filter(
        (call) => (call[0] as { uuid?: string })?.uuid === sharedTraverse.uuid
      );
      expect(elevCallsForTraverse).toHaveLength(1);
    });

    it("skips evas with empty sequences (no traverse to update)", async () => {
      // Set all evas to have empty sequence with lander egress/ingress
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m: Mission) => {
        for (const e of Object.values(m.evas)) {
          e.sequence = [];
          e.egressLocationUuid = "lander";
          e.ingressLocationUuid = "lander";
        }
      });

      const newLanderLoc: AEGISPoint = { lat: -1, lng: -1 };
      await expect(
        store.dispatch(thunkDocUpdateLanderLocation({ location: newLanderLoc }))
      ).resolves.not.toThrow();
      expect(getMission().landerLocation).toEqual(newLanderLoc);
    });
  });
});
