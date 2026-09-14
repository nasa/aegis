/**
 * Data-driven integration test for the Maestro v2 `sendMDAU` pipeline.
 *
 * Loads a `sendMDAU` payload from `fixtures/mdau-sample.json`,
 * builds a mission Automerge doc whose entities carry the uuids
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

// ── Mission builder (derived entirely from the sample payload) ────────────────

interface BuiltMission {
  handle: DocHandle<Mission>;
  evaUuid: string | undefined;
  rexUuid: string | undefined;
  /**
   * Traverse uuids that sit immediately before/after a station in the EVA
   * sequence and thus get renamed when that station is renamed.
   */
  adjacentTraverseUuids: string[];
}

/**
 * Build a mission doc whose entities carry the exact uuids used in the sample.
 *
 * Maestro now addresses every entity by its AEGIS uuid, which is globally
 * unique, so a single EVA scope covers both the top-level entity updates and
 * the rex entry-map updates. The EVA is owned by the sample's REX so the
 * `aegisRexes` payload resolves.
 */
function buildMissionFromSample(): BuiltMission {
  const stations: Station[] = [];
  const traverses: Traverse[] = [];
  const actions: Action[] = [];
  const evas: Eva[] = [];
  const rexes: Rex[] = [];

  const sampleStations = mdau.aegisStations ?? {};
  const sampleTraverses = mdau.aegisTraverse ?? {};

  for (const uuid in sampleStations) {
    // A non-null location is required so adjacent-traverse renames can compute
    // the "<before> to <after>" name from station endpoints.
    const station = generateBlankStation({
      uuid,
      name: `orig-${uuid.slice(0, 6)}`,
      location: { lat: 1, lng: 1 },
    });
    // Seed a matching action for each entry in the incoming order, since
    // Maestro may only reorder, not add or remove.
    station.actionOrderUuids = (sampleStations[uuid].actionOrderUuids ?? []).map((actionUuid) => {
      actions.push(generateBlankAction({ uuid: actionUuid, stationUuid: station.uuid }));
      return actionUuid;
    });
    stations.push(station);
  }

  for (const uuid in sampleTraverses) {
    const traverse = generateBlankTraverse({ uuid, name: `orig-${uuid.slice(0, 6)}` });
    traverse.actionOrderUuids = (sampleTraverses[uuid].actionOrderUuids ?? []).map((actionUuid) => {
      actions.push(generateBlankAction({ uuid: actionUuid, traverseUuid: traverse.uuid }));
      return actionUuid;
    });
    traverses.push(traverse);
  }

  // Build the EVA from the sample's own sequence so stations are correctly
  // flanked by traverses — this is what drives the adjacent-traverse rename.
  const evaUuid = mdau.aegisEva ? Object.keys(mdau.aegisEva)[0] : undefined;
  const evaSample = evaUuid ? mdau.aegisEva![evaUuid] : undefined;
  const adjacentTraverseUuids: string[] = [];
  let eva: Eva | undefined;
  if (evaUuid) {
    const knownUuids = new Set([...Object.keys(sampleStations), ...Object.keys(sampleTraverses)]);
    const sequence = (evaSample?.sequence ?? [])
      .filter((item) => knownUuids.has(item.uuid))
      .map((item) => ({ type: item.type, uuid: item.uuid }));

    for (let i = 0; i < sequence.length; i++) {
      if (sequence[i].type !== "station") continue;
      const before = sequence[i - 1];
      const after = sequence[i + 1];
      if (before?.type === "traverse") adjacentTraverseUuids.push(before.uuid);
      if (after?.type === "traverse") adjacentTraverseUuids.push(after.uuid);
    }

    eva = generateBlankEVA({ uuid: evaUuid, name: "orig-eva", sequence });
    evas.push(eva);
  }

  // The sample's REX owns that EVA so the rex entry maps resolve.
  const rexSample = mdau.aegisRexes ? Object.values(mdau.aegisRexes)[0] : undefined;
  let rex: Rex | undefined;
  if (rexSample && eva) {
    rex = generateBlankRex({
      uuid: rexSample.uuid,
      evaUuid: eva.uuid,
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

  return { handle, evaUuid: eva?.uuid, rexUuid: rex?.uuid, adjacentTraverseUuids };
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
    for (const uuid in mdau.aegisStations) {
      const src = mdau.aegisStations[uuid];
      const station = doc.stations[uuid];
      expect(station, `station ${uuid}`).toBeDefined();
      expect(station.name).toBe(src.name);
      expect(station.duration).toBe(src.duration);
      expect(station.updatedAt).toBe(src.updatedAt);
    }
  });
});

describe("sendMDAU sample payload — traverses", () => {
  it("writes duration for every sampled traverse", () => {
    const doc = built.handle.doc();
    for (const uuid in mdau.aegisTraverse) {
      const src = mdau.aegisTraverse[uuid];
      const traverse = doc.traverses[uuid];
      expect(traverse, `traverse ${uuid}`).toBeDefined();
      expect(traverse.duration).toBe(src.duration);
      expect(typeof traverse.updatedAt).toBe("number");
    }
  });

  it("cascades adjacent traverse renames when a station name changes", () => {
    // This scenario requires the sample to rename at least one station that is
    // flanked by a traverse in the EVA sequence.
    if (built.adjacentTraverseUuids.length === 0) return;

    const doc = built.handle.doc();
    // At least one adjacent traverse should now carry the renamed station's
    // name in its recomputed "<before> to <after>" label. Seeded traverse names
    // are `orig-*`, so any change away from that proves the cascade ran.
    const renamed = built.adjacentTraverseUuids.some((uuid) => {
      const name = doc.traverses[uuid]?.name ?? "";
      return name.length > 0 && !name.startsWith("orig-");
    });
    expect(renamed, "expected an adjacent traverse to be renamed").toBe(true);
  });
});

describe("sendMDAU sample payload — evas", () => {
  it("writes name / datetime for the eva", () => {
    if (!mdau.aegisEva || !built.evaUuid) return;
    const doc = built.handle.doc();
    const src = mdau.aegisEva[built.evaUuid];
    const eva = doc.evas[built.evaUuid];
    expect(eva).toBeDefined();
    expect(typeof eva.name).toBe("string");
    expect(eva.name).toBe(src.name);
    expect(eva.datetime).toBe(src.datetime);
    expect(eva.updatedAt).toBe(src.updatedAt);
  });
});

describe("sendMDAU sample payload — actions", () => {
  it("writes crewAssigned (actors) for every sampled action", () => {
    const doc = built.handle.doc();
    for (const uuid in mdau.aegisAction) {
      const src = mdau.aegisAction[uuid];
      const action = doc.actions[uuid];
      expect(action, `action ${uuid}`).toBeDefined();
      expect(action.crewAssigned).toEqual(src.actors);
    }
  });

  it("writes name / descriptionTask / duration / stmAction / enabled for every sampled action", () => {
    const doc = built.handle.doc();
    for (const refUuid in mdau.aegisAction) {
      const src = mdau.aegisAction[refUuid];
      const action = doc.actions[built.actionUuidByRef.get(refUuid)!];
      expect(action.name).toBe(src.name);
      expect(action.descriptionTask).toBe(src.descriptionTask);
      expect(action.duration).toBe(src.duration);
      expect(action.stmAction).toBe(src.stmAction);
      expect(action.enabled).toBe(src.enabled);
    }
  });

  it("writes missionPriorityUuid for every sampled action", () => {
    const doc = built.handle.doc();
    for (const refUuid in mdau.aegisAction) {
      const src = mdau.aegisAction[refUuid];
      const action = doc.actions[built.actionUuidByRef.get(refUuid)!];
      expect(action.missionPriorityUuid).toBe(src.missionPriorityUuid);
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

  it("writes the station / traverse / action entry maps", () => {
    if (!mdau.aegisRexes || !built.rexUuid) return;
    const doc = built.handle.doc();
    const src = Object.values(mdau.aegisRexes)[0];
    const rex = doc.rexes[built.rexUuid];

    for (const uuid in src.stationEntries) {
      expect(rex.stationEntries?.[uuid]?.rexStatus).toBe(src.stationEntries[uuid].rexStatus);
    }

    for (const uuid in src.traverseEntries) {
      expect(rex.traverseEntries?.[uuid]?.rexStatus).toBe(src.traverseEntries[uuid].rexStatus);
    }

    for (const uuid in src.actionEntries) {
      expect(rex.actionEntries?.[uuid]?.rexStatus).toBe(src.actionEntries[uuid].rexStatus);
    }
  });

  it("writes maestroActivityProperties keyed by sequence uuid", () => {
    if (!mdau.aegisRexes || !built.rexUuid) return;
    const doc = built.handle.doc();
    const src = Object.values(mdau.aegisRexes)[0];
    const rex = doc.rexes[built.rexUuid];

    for (const uuid in src.maestroActivityProperties) {
      expect(rex.maestroActivityProperties?.[uuid]?.color).toBe(
        src.maestroActivityProperties[uuid].color
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
