/**
 * The single atomic operation.
 * Mutates EVERYTHING — stations, traverses, evas, actions, and rexes — inside
 * ONE `docHandle.change()`.
 */
import type { DocHandle } from "@automerge/automerge-repo";
import { stageAdjacentTraverseRenames } from "operations/stage/stage-traverse";
import { globalValues } from "server/express/global";
import {
  applyMdauActions,
  applyMdauEvas,
  applyMdauRexes,
  applyMdauStations,
  applyMdauTraverses,
  applyTraverseRenames,
  stopOtherRexes,
} from "./apply-mdau";
import { stageMdau } from "./stage-mdau";
import type { MDAU } from "../types/mdau";

/**
 * Update the mission doc from an entire MDAU payload atomically.
 * Only data belonging to EVAs that Maestro is currently subscribed to is
 * applied.
 *
 * @param docHandle - the mission's Automerge doc handle
 * @param missionId - the mission id (used to look up EVA subscriptions)
 * @param mdau      - the raw MDAU payload from Maestro
 */
export const opUpdateMdau = (
  docHandle: DocHandle<Mission>,
  missionId: number,
  mdau: MDAU.MaestroDataAegisUses
): void => {
  const mission = docHandle.doc();
  if (!mission) return;

  const subscribedEvaUuids = new Set(globalValues.maestroV2.evaSubscriptions.get(missionId) ?? []);
  const stage = stageMdau(mission, mdau, subscribedEvaUuids);
  if (
    stage.stations.length === 0 &&
    stage.traverses.length === 0 &&
    stage.evas.length === 0 &&
    stage.actions.length === 0 &&
    stage.rexes.length === 0
  )
    // If empty and nothing to apply, just return
    return;

  // Determine adjacent traverse rename cascades for any station whose name
  // changed.
  const traverseRenames: { traverseUuid: string; newName: string }[] = [];
  for (const s of stage.stations) {
    if (s.name === undefined) continue;
    const renames = stageAdjacentTraverseRenames(mission, {
      stationUuid: s.uuid,
      newName: s.name,
    });
    if (renames) traverseRenames.push(...renames);
  }

  // Determine which other rexes must be stopped.
  const rexUuidsToStop = new Set<string>();
  const startingRexUuids = new Set(stage.rexes.filter((r) => r.startsRunning).map((r) => r.uuid));
  if (startingRexUuids.size > 0) {
    for (const existingRex of Object.values(mission.rexes ?? {})) {
      if (existingRex.isRunning && !startingRexUuids.has(existingRex.uuid)) {
        rexUuidsToStop.add(existingRex.uuid);
      }
    }
  }

  docHandle.change((m: Mission) => {
    applyMdauStations(m, stage);
    applyMdauTraverses(m, stage);
    applyTraverseRenames(m, traverseRenames);
    applyMdauEvas(m, stage);
    applyMdauActions(m, stage);
    stopOtherRexes(m, rexUuidsToStop);
    applyMdauRexes(m, stage);
  });
};
