/**
 * Data-driven integration test for the Maestro v2 `sendMDAU` pipeline.
 *
 * Loads a `sendMDAU` payload from `fixtures/mdau-sample.json`,
 * builds a mission Automerge doc whose entities carry the data
 * referenced in that payload, then runs `opUpdateMdau` and asserts
 * that a sampling of fields from every entity type (station, traverse, eva,
 * action, rex) was written back into the doc.
 *
 * No real mission data is edited.
 *
 * The test is fully driven by the JSON contents — the test mission is
 * derived from the file. Drop updated data into `fixtures/mdau-sample.json`.
 */
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { globalValues } from "server/express/global";
import { opUpdateMdau } from "server/maestro/v2/operations/op-mdau";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import type { DocHandle } from "@automerge/automerge-repo";
import type { MDAU } from "server/maestro/v2/types/mdau";
import sampleFile from "./fixtures/mdau-sample.json";

// ── Sample payload ───────────────────────────────────────────────────────────

const sample = sampleFile as unknown as {
  missionId: number;
  mdau: MDAU.MaestroDataAegisUses;
};
const MISSION_ID = sample.missionId ?? 9999;
const mdau = sample.mdau;

/**
 * MDAU `name` may arrive as a plain string or as a `[string]` array. AEGIS
 * writes whatever it is given straight into the doc, so assertions compare
 * against the raw sample value rather than normalizing.
 */

// ── Mission builder (derived entirely from the sample payload) ────────────────

interface BuiltMission {
  handle: DocHandle<Mission>;
  /** refUuid → as-planned uuid, per entity kind */
  stationUuidByRef: Map<string, string>;
  traverseUuidByRef: Map<string, string>;
  actionUuidByRef: Map<string, string>;
  asPlannedEvaUuid: string | undefined;
  /** refUuid → rex-scoped uuid, per entity kind */
  rexStationUuidByRef: Map<string, string>;
  rexTraverseUuidByRef: Map<string, string>;
  rexActionUuidByRef: Map<string, string>;
  rexUuid: string | undefined;
  rexEvaUuid: string | undefined;
  /**
   * As-planned traverse refUuids that sit immediately before/after a station
   * in the EVA sequence and thus get renamed when that station is renamed.
   */
  adjacentTraverseRefUuids: string[];
}

/**
 * Build an sequence of station/traverse sequence items from an EVA's
 * `sequenceRefUuids`, resolving each refUuid to the uuid registered in the
 * given maps. Items whose refUuid is not in the maps are skipped.
 */
function buildEvaSequence(
  sequenceRefUuids: MDAU.MdauEva["sequenceRefUuids"] | undefined,
  stationUuidByRef: Map<string, string>,
  traverseUuidByRef: Map<string, string>
): { type: "station" | "traverse"; uuid: string }[] {
  const seq: { type: "station" | "traverse"; uuid: string }[] = [];
  for (const item of sequenceRefUuids ?? []) {
    const uuid =
      item.type === "station"
        ? stationUuidByRef.get(item.refUuid)
        : traverseUuidByRef.get(item.refUuid);
    if (uuid) seq.push({ type: item.type, uuid });
  }
  return seq;
}

/**
 * Build a mission doc whose entities match the refUuids in the sample.
 *
 * Two EVA scopes are constructed so both the top-level entity updates and the
 * rex entry-map updates resolve:
 *   1. An **as-planned** EVA carrying stations/traverses/actions for the
 *      `aegisStations` / `aegisTraverse` / `aegisEva` / `aegisAction` updates.
 *   2. A **rex-owned** EVA duplicating the same sequence (fresh uuids, same
 *      refUuids) so the `aegisRexes` entry maps resolve in rex scope.
 */
function buildMissionFromSample(): BuiltMission {
  const stationUuidByRef = new Map<string, string>();
  const traverseUuidByRef = new Map<string, string>();
  const actionUuidByRef = new Map<string, string>();
  const rexStationUuidByRef = new Map<string, string>();
  const rexTraverseUuidByRef = new Map<string, string>();
  const rexActionUuidByRef = new Map<string, string>();

  const stations: Station[] = [];
  const traverses: Traverse[] = [];
  const actions: Action[] = [];
  const evas: Eva[] = [];
  const rexes: Rex[] = [];

  // Map each station/traverse refUuid → the ordered action refUuids that hang
  // off it, so the as-planned entities carry a matching actionOrder length
  // (Maestro may only reorder, not add/remove).
  const stationActionRefs = mdau.aegisStations ?? {};
  const traverseActionRefs = mdau.aegisTraverse ?? {};

  // ── As-planned scope ───────────────────────────────────────────────────────
  const asPlannedSequence: { type: "station" | "traverse"; uuid: string }[] = [];

  for (const refUuid in stationActionRefs) {
    // A non-null location is required so adjacent-traverse renames can compute
    // the "<before> to <after>" name from station endpoints.
    const station = generateBlankStation({
      refUuid,
      name: `orig-${refUuid.slice(0, 6)}`,
      location: { lat: 1, lng: 1 },
    });
    const orderRefs = stationActionRefs[refUuid].actionOrderRefUuids ?? [];
    const orderUuids: string[] = [];
    for (const actionRef of orderRefs) {
      const action = generateBlankAction({ refUuid: actionRef, stationUuid: station.uuid });
      actions.push(action);
      actionUuidByRef.set(actionRef, action.uuid);
      orderUuids.push(action.uuid);
    }
    station.actionOrderUuids = orderUuids;
    stations.push(station);
    stationUuidByRef.set(refUuid, station.uuid);
  }

  for (const refUuid in traverseActionRefs) {
    const traverse = generateBlankTraverse({ refUuid, name: `orig-${refUuid.slice(0, 6)}` });
    const orderRefs = traverseActionRefs[refUuid].actionOrderRefUuids ?? [];
    const orderUuids: string[] = [];
    for (const actionRef of orderRefs) {
      const action = generateBlankAction({ refUuid: actionRef, traverseUuid: traverse.uuid });
      actions.push(action);
      actionUuidByRef.set(actionRef, action.uuid);
      orderUuids.push(action.uuid);
    }
    traverse.actionOrderUuids = orderUuids;
    traverses.push(traverse);
    traverseUuidByRef.set(refUuid, traverse.uuid);
  }

  // As-planned EVA: use the first aegisEva refUuid (if any) so the eva update
  // resolves against the as-planned EVA. Order the sequence from the EVA's real
  // `sequenceRefUuids` so stations are correctly flanked by traverses — this is
  // what drives the adjacent-traverse rename cascade.
  const evaRefUuid = mdau.aegisEva ? Object.keys(mdau.aegisEva)[0] : undefined;
  const evaSample = evaRefUuid ? mdau.aegisEva![evaRefUuid] : undefined;
  const adjacentTraverseRefUuids: string[] = [];
  let asPlannedEva: Eva | undefined;
  if (evaRefUuid) {
    const orderedSeq = buildEvaSequence(
      evaSample?.sequenceRefUuids,
      stationUuidByRef,
      traverseUuidByRef
    );
    // Fall back to an arbitrary order if the sample carried no EVA sequence.
    asPlannedSequence.push(...(orderedSeq.length > 0 ? orderedSeq : []));

    // Record which traverse refUuids are adjacent to a station in the sequence.
    const seqRefs = evaSample?.sequenceRefUuids ?? [];
    for (let i = 0; i < seqRefs.length; i++) {
      if (seqRefs[i].type !== "station") continue;
      const before = seqRefs[i - 1];
      const after = seqRefs[i + 1];
      if (before?.type === "traverse") adjacentTraverseRefUuids.push(before.refUuid);
      if (after?.type === "traverse") adjacentTraverseRefUuids.push(after.refUuid);
    }

    asPlannedEva = generateBlankEVA({
      refUuid: evaRefUuid,
      name: "orig-eva",
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: asPlannedSequence,
    });
    evas.push(asPlannedEva);
  }

  // ── Rex-owned scope ──────────────────────────────────────────────────────────
  // Duplicate the sequence with fresh uuids but the SAME refUuids so the rex's
  // entry maps resolve in rex scope. Only needed when the sample has rexes.
  const rexSample = mdau.aegisRexes ? Object.values(mdau.aegisRexes)[0] : undefined;
  let rexEva: Eva | undefined;
  let rex: Rex | undefined;
  if (rexSample) {
    const rexSequence: { type: "station" | "traverse"; uuid: string }[] = [];

    for (const refUuid in stationActionRefs) {
      const station = generateBlankStation({ refUuid, name: `rex-${refUuid.slice(0, 6)}` });
      const orderRefs = stationActionRefs[refUuid].actionOrderRefUuids ?? [];
      const orderUuids: string[] = [];
      for (const actionRef of orderRefs) {
        const action = generateBlankAction({ refUuid: actionRef, stationUuid: station.uuid });
        actions.push(action);
        rexActionUuidByRef.set(actionRef, action.uuid);
        orderUuids.push(action.uuid);
      }
      station.actionOrderUuids = orderUuids;
      stations.push(station);
      rexStationUuidByRef.set(refUuid, station.uuid);
      rexSequence.push({ type: "station", uuid: station.uuid });
    }

    for (const refUuid in traverseActionRefs) {
      const traverse = generateBlankTraverse({ refUuid, name: `rex-${refUuid.slice(0, 6)}` });
      const orderRefs = traverseActionRefs[refUuid].actionOrderRefUuids ?? [];
      const orderUuids: string[] = [];
      for (const actionRef of orderRefs) {
        const action = generateBlankAction({ refUuid: actionRef, traverseUuid: traverse.uuid });
        actions.push(action);
        rexActionUuidByRef.set(actionRef, action.uuid);
        orderUuids.push(action.uuid);
      }
      traverse.actionOrderUuids = orderUuids;
      traverses.push(traverse);
      rexTraverseUuidByRef.set(refUuid, traverse.uuid);
      rexSequence.push({ type: "traverse", uuid: traverse.uuid });
    }

    // The rex-owned EVA shares the aegisEva refUuid (its dedicated instance).
    rexEva = generateBlankEVA({
      refUuid: evaRefUuid ?? "rex-eva-ref",
      name: "rex-eva",
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: rexSequence,
    });
    evas.push(rexEva);

    rex = generateBlankRex({
      uuid: rexSample.uuid,
      evaUuid: rexEva.uuid,
      isRunning: false,
      posEntries: [],
    });
    rexes.push(rex);
  }

  const handle = getMissionDocHandle();
  handle.change((m) => {
    for (const s of stations) m.stations[s.uuid] = s;
    for (const t of traverses) m.traverses[t.uuid] = t;
    for (const a of actions) m.actions[a.uuid] = a;
    for (const e of evas) m.evas[e.uuid] = e;
    for (const r of rexes) m.rexes[r.uuid] = r;
    // Give the rex an egress lander location so starting it doesn't fail.
    m.landerLocation = { lat: 0, lng: 0 };
  });

  return {
    handle,
    stationUuidByRef,
    traverseUuidByRef,
    actionUuidByRef,
    asPlannedEvaUuid: asPlannedEva?.uuid,
    rexStationUuidByRef,
    rexTraverseUuidByRef,
    rexActionUuidByRef,
    rexUuid: rex?.uuid,
    rexEvaUuid: rexEva?.uuid,
    adjacentTraverseRefUuids,
  };
}

// ── Test lifecycle ───────────────────────────────────────────────────────────

let built: BuiltMission;

beforeAll(() => {
  // This call is mocked in the vitest.setup.ts file. It will create a blank mission for testing
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  globalValues.maestroV2.evaSubscriptions = new Map();
  getMissionDocHandle().change((m) => {
    m.stations = {};
    m.traverses = {};
    m.evas = {};
    m.actions = {};
    m.rexes = {};
  });

  built = buildMissionFromSample();

  // Subscribe Maestro to every EVA in the doc so nothing is gated out.
  const evaUuids = Object.keys(built.handle.doc().evas ?? {});
  globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, evaUuids);

  // Apply the sample payload once — every assertion reads the resulting doc.
  opUpdateMdau(built.handle, MISSION_ID, mdau);
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("sendMDAU sample payload — stations", () => {
  it("has station data to exercise", () => {
    expect(Object.keys(mdau.aegisStations ?? {}).length).toBeGreaterThan(0);
  });

  it("writes name / duration for every sampled station", () => {
    const doc = built.handle.doc();
    for (const refUuid in mdau.aegisStations) {
      const src = mdau.aegisStations[refUuid];
      const uuid = built.stationUuidByRef.get(refUuid);
      expect(uuid, `station uuid for refUuid ${refUuid}`).toBeDefined();
      const station = doc.stations[uuid!];
      expect(station).toBeDefined();
      expect(station.name).toEqual(src.name);
      expect(station.duration).toBe(src.duration);
      // updatedAt is written from the sample when a field changes; assert it
      // is present (Maestro may send it as an ISO string or epoch number).
      expect(station.updatedAt).toBeTruthy();
    }
  });
});

describe("sendMDAU sample payload — traverses", () => {
  it("writes duration for every sampled traverse", () => {
    const doc = built.handle.doc();
    for (const refUuid in mdau.aegisTraverse) {
      const src = mdau.aegisTraverse[refUuid];
      const uuid = built.traverseUuidByRef.get(refUuid);
      expect(uuid, `traverse uuid for refUuid ${refUuid}`).toBeDefined();
      const traverse = doc.traverses[uuid!];
      expect(traverse).toBeDefined();
      expect(traverse.duration).toBe(src.duration);
      // updatedAt may be the sample value or re-stamped by adjacent-station
      // rename side-effects; assert it is present either way.
      expect(traverse.updatedAt).toBeTruthy();
    }
  });

  it("cascades adjacent traverse renames when a station name changes", () => {
    // This scenario requires the sample to rename at least one station that is
    // flanked by a traverse in the EVA sequence.
    if (built.adjacentTraverseRefUuids.length === 0) return;

    const doc = built.handle.doc();
    // At least one adjacent traverse should now carry the renamed station's
    // name in its recomputed "<before> to <after>" label. Seeded traverse names
    // are `orig-*`, so any change away from that proves the cascade ran.
    const renamed = built.adjacentTraverseRefUuids.some((traverseRef) => {
      const uuid = built.traverseUuidByRef.get(traverseRef);
      if (!uuid) return false;
      const name = doc.traverses[uuid]?.name ?? "";
      return name.length > 0 && !name.startsWith("orig-");
    });
    expect(renamed, "expected an adjacent traverse to be renamed").toBe(true);
  });
});

describe("sendMDAU sample payload — evas", () => {
  it("writes name / durations for the as-planned eva", () => {
    if (!mdau.aegisEva || !built.asPlannedEvaUuid) return;
    const doc = built.handle.doc();
    const refUuid = Object.keys(mdau.aegisEva)[0];
    const src = mdau.aegisEva[refUuid];
    const eva = doc.evas[built.asPlannedEvaUuid];
    expect(eva).toBeDefined();
    expect(eva.name).toEqual(src.name);
    expect(eva.ingressDuration).toBe(src.ingressDuration);
    expect(eva.egressDuration).toBe(src.egressDuration);
    expect(eva.updatedAt).toBeTruthy();
  });
});

describe("sendMDAU sample payload — actions", () => {
  it("writes crewAssigned (actors) for every sampled action", () => {
    const doc = built.handle.doc();
    for (const refUuid in mdau.aegisAction) {
      const src = mdau.aegisAction[refUuid];
      const uuid = built.actionUuidByRef.get(refUuid);
      expect(uuid, `action uuid for refUuid ${refUuid}`).toBeDefined();
      const action = doc.actions[uuid!];
      expect(action).toBeDefined();
      expect(action.crewAssigned).toEqual(src.actors);
    }
  });
});

describe("sendMDAU sample payload — rexes", () => {
  it("writes rex scalar fields", () => {
    if (!mdau.aegisRexes || !built.rexUuid) return;
    const doc = built.handle.doc();
    const src = Object.values(mdau.aegisRexes)[0];
    const rex = doc.rexes[built.rexUuid];
    expect(rex).toBeDefined();
    expect(rex.isRunning).toBe(src.isRunning);
    expect(rex.maestroControlled).toBe(src.maestroControlled);
    expect(rex.petRunning).toBe(src.petRunning);
    expect(rex.petStartStopTimestamp).toBe(src.petStartStopTimestamp);
    expect(rex.petValueAtStartStop).toBe(src.petValueAtStartStop);
  });

  it("resolves station / traverse / action entry maps to uuids", () => {
    if (!mdau.aegisRexes || !built.rexUuid) return;
    const doc = built.handle.doc();
    const src = Object.values(mdau.aegisRexes)[0];
    const rex = doc.rexes[built.rexUuid];

    for (const refUuid in src.stationEntriesByRefUuid) {
      const uuid = built.rexStationUuidByRef.get(refUuid);
      expect(uuid, `rex station entry uuid for refUuid ${refUuid}`).toBeDefined();
      expect(rex.stationEntries?.[uuid!]?.rexStatus).toBe(
        src.stationEntriesByRefUuid[refUuid].rexStatus
      );
    }

    for (const refUuid in src.traverseEntriesByRefUuid) {
      const uuid = built.rexTraverseUuidByRef.get(refUuid);
      expect(uuid, `rex traverse entry uuid for refUuid ${refUuid}`).toBeDefined();
      expect(rex.traverseEntries?.[uuid!]?.rexStatus).toBe(
        src.traverseEntriesByRefUuid[refUuid].rexStatus
      );
    }

    for (const refUuid in src.actionEntriesByRefUuid) {
      const uuid = built.rexActionUuidByRef.get(refUuid);
      expect(uuid, `rex action entry uuid for refUuid ${refUuid}`).toBeDefined();
      expect(rex.actionEntries?.[uuid!]?.rexStatus).toBe(
        src.actionEntriesByRefUuid[refUuid].rexStatus
      );
    }
  });

  it("passes xgress entries through verbatim by key", () => {
    if (!mdau.aegisRexes || !built.rexUuid) return;
    const doc = built.handle.doc();
    const src = Object.values(mdau.aegisRexes)[0];
    const rex = doc.rexes[built.rexUuid];

    for (const xgressKey in src.xgressEntries) {
      expect(rex.xgressEntries?.[xgressKey]?.rexStatus).toBe(
        src.xgressEntries[xgressKey].rexStatus
      );
    }
  });

  it("stops other running rexes when the sample rex starts", () => {
    if (!mdau.aegisRexes || !built.rexUuid) return;
    const src = Object.values(mdau.aegisRexes)[0];
    // This path only fires when the sample rex is transitioning to running.
    if (!src.isRunning) return;

    // Rebuild a fresh mission so the sample rex is not-yet-running, then add a
    // second, unrelated rex that IS already running. Applying the sample must
    // start the sample rex and stop the other one.
    globalValues.maestroV2.evaSubscriptions = new Map();
    getMissionDocHandle().change((m) => {
      m.stations = {};
      m.traverses = {};
      m.evas = {};
      m.actions = {};
      m.rexes = {};
    });
    const fresh = buildMissionFromSample();

    const otherEva = generateBlankEVA({
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
      sequence: [],
    });
    const otherRex = generateBlankRex({ evaUuid: otherEva.uuid, isRunning: true });
    fresh.handle.change((m) => {
      m.evas[otherEva.uuid] = otherEva;
      m.rexes[otherRex.uuid] = otherRex;
    });

    const evaUuids = Object.keys(fresh.handle.doc().evas ?? {});
    globalValues.maestroV2.evaSubscriptions.set(MISSION_ID, evaUuids);

    opUpdateMdau(fresh.handle, MISSION_ID, mdau);

    const doc = fresh.handle.doc();
    expect(doc.rexes[fresh.rexUuid!].isRunning).toBe(true);
    expect(doc.rexes[otherRex.uuid].isRunning).toBe(false);
  });
});
