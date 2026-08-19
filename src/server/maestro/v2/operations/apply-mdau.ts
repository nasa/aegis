import { v4 as uuidv4 } from "uuid";
import { getEgressStationUuid } from "operations/helpers/evaSequence";
import type { MdauStageData } from "../types/mdauStageData";

/**
 * Apply station-name-driven adjacent traverse renames. Uses the incoming
 * Maestro `updatedAt` when the traverse was also directly staged, otherwise
 * stamps `now` (the rename is an AEGIS-derived side-effect with no Maestro
 * timestamp of its own).
 */
export const applyTraverseRenames = (
  m: Mission,
  renames: { traverseUuid: string; newName: string }[]
): void => {
  for (const { traverseUuid, newName } of renames) {
    const traverse = m.traverses[traverseUuid];
    if (!traverse) continue;
    traverse.name = newName;
    traverse.updatedAt = Date.now();
  }
};

// ── Station / traverse / eva / action writers ───────────────────────────────

export const applyMdauStations = (m: Mission, stage: MdauStageData): void => {
  for (const s of stage.stations) {
    const station = m.stations[s.uuid];
    if (!station) continue;
    if (s.name !== undefined) station.name = s.name;
    if (s.duration !== undefined) station.duration = s.duration;
    if (s.actionOrderUuids) station.actionOrderUuids = s.actionOrderUuids;
    if (s.updatedAt !== undefined) station.updatedAt = s.updatedAt;
  }
};

export const applyMdauTraverses = (m: Mission, stage: MdauStageData): void => {
  for (const t of stage.traverses) {
    const traverse = m.traverses[t.uuid];
    if (!traverse) continue;
    if (t.duration !== undefined) traverse.duration = t.duration;
    if (t.actionOrderUuids) traverse.actionOrderUuids = t.actionOrderUuids;
    if (t.updatedAt !== undefined) traverse.updatedAt = t.updatedAt;
  }
};

export const applyMdauEvas = (m: Mission, stage: MdauStageData): void => {
  for (const e of stage.evas) {
    const eva = m.evas[e.uuid];
    if (!eva) continue;
    if (e.name !== undefined) eva.name = e.name;
    if (e.datetime !== undefined) eva.datetime = e.datetime;
    if (e.updatedAt !== undefined) eva.updatedAt = e.updatedAt;
  }
};

export const applyMdauActions = (m: Mission, stage: MdauStageData): void => {
  for (const a of stage.actions) {
    const action = m.actions[a.uuid];
    if (!action) continue;
    if (a.name !== undefined) action.name = a.name;
    if (a.descriptionTask !== undefined) action.descriptionTask = a.descriptionTask;
    if (a.duration !== undefined) action.duration = a.duration;
    if (a.stmAction !== undefined) action.stmAction = a.stmAction;
    if (a.actionDefinition !== undefined) action.actionDefinition = a.actionDefinition;
    if (a.crewAssigned !== undefined) action.crewAssigned = a.crewAssigned;
    if (a.updatedAt !== undefined) action.updatedAt = a.updatedAt;
  }
};

// ── Rex writers ─────────────────────────────────────────────────────────────

export const stopOtherRexes = (m: Mission, rexUuidsToStop: Set<string>): void => {
  for (const uuid of rexUuidsToStop) {
    const rex = m.rexes[uuid];
    if (!rex) continue;
    rex.isRunning = false;
    rex.updatedAt = Date.now();
  }
};

export const applyMdauRexes = (m: Mission, stage: MdauStageData): void => {
  for (const rexStage of stage.rexes) {
    const rex = m.rexes[rexStage.uuid];
    if (!rex) continue;

    // Generate initial crew position entries when transitioning to running.
    if (rexStage.startsRunning) {
      generateInitialPosEntries(m, rex);
    }

    // Station activity entries (merged with any existing entry).
    if (Object.keys(rexStage.stationEntries).length > 0) {
      if (!rex.stationEntries) rex.stationEntries = {};
      for (const uuid in rexStage.stationEntries) {
        rex.stationEntries[uuid] = {
          ...rex.stationEntries[uuid],
          ...rexStage.stationEntries[uuid],
        };
      }
    }

    // Traverse activity entries.
    if (Object.keys(rexStage.traverseEntries).length > 0) {
      if (!rex.traverseEntries) rex.traverseEntries = {};
      for (const uuid in rexStage.traverseEntries) {
        rex.traverseEntries[uuid] = {
          ...rex.traverseEntries[uuid],
          ...rexStage.traverseEntries[uuid],
        };
      }
    }

    // Action entries
    if (Object.keys(rexStage.actionEntries).length > 0) {
      if (!rex.actionEntries) rex.actionEntries = {};
      for (const uuid in rexStage.actionEntries) {
        const existing: ActionEntry = rex.actionEntries[uuid] ?? {
          rexStatus: "pending",
          markerId: "",
          containerId: "",
          secondaryContainerId: "",
        };
        rex.actionEntries[uuid] = { ...existing, ...rexStage.actionEntries[uuid] };
      }
    }

    // maestroActivityProperties (resolved to uuid keys).
    if (rexStage.maestroActivityProperties !== null) {
      rex.maestroActivityPropertiesByRefUuid = rexStage.maestroActivityProperties;
    }

    // Apply all the other regular fields.
    const f = rexStage.fields;
    if (f.petStartStopTimestamp !== undefined) rex.petStartStopTimestamp = f.petStartStopTimestamp;
    if (f.petValueAtStartStop !== undefined) rex.petValueAtStartStop = f.petValueAtStartStop;
    if (f.petRunning !== undefined) rex.petRunning = f.petRunning;
    if (f.isRunning !== undefined) rex.isRunning = f.isRunning;
    if (f.maestroControlled !== undefined) rex.maestroControlled = f.maestroControlled;

    rex.updatedAt = rexStage.updatedAt;
  }
};

/**
 * Seed a rex's crew position entries from the EVA's egress location when it
 * first starts running and has none.
 */
const generateInitialPosEntries = (m: Mission, rex: Rex): void => {
  if (rex.posEntries && rex.posEntries.length > 0) return;

  const rexEva = m.evas?.[rex.evaUuid];
  // Spread the point to detach it from the live Automerge proxy before re-insert.
  const loc = m.stations?.[getEgressStationUuid(rexEva?.sequence)]?.location;
  const egressLocation: AEGISPoint | null = loc ? { ...loc } : null;
  if (!egressLocation) return;

  const now = Date.now();
  // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket
  rex.posEntries = rex.posSources.map((posSource) => {
    const newPosEntry: PosEntry = {
      uuid: uuidv4(),
      location: egressLocation,
      elevation: null,
      petSeconds: 0,
      posTypeUuids: rex.posTypes.map((posType) => posType.uuid),
      posSourceUuid: posSource.uuid,
      createdAt: now,
      updatedAt: now,
    };
    return newPosEntry;
  });
};
