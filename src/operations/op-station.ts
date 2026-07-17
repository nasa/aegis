import { stageAdjacentTraverseRenames } from "operations/stage/stage-traverse";
import { applyUpdateStationByField } from "operations/apply/apply-station";
import { applyUpdateTraverseByField } from "./apply/apply-traverse";

/**
 * Update a single station's name atomically, cascading the new name into
 * every adjacent EVA-sequence traverse whose auto-generated display name
 * embeds this station's name.
 */
export function opUpdateStationName(
  missionDocHandle: DocHandle<Mission>,
  stationUuid: string,
  newName: string
): void {
  if (!missionDocHandle || !stationUuid || !newName) return;
  const mission = missionDocHandle.doc();
  if (!mission) return;

  const traverseRenames = stageAdjacentTraverseRenames(mission, { stationUuid, newName });
  if (traverseRenames === undefined) return;

  // Apply the staged updates to the automerge doc in a single atomic change.
  missionDocHandle.change((m: Mission) => {
    applyUpdateStationByField(m, {
      stationUuid,
      fieldName: "name",
      value: newName,
    });

    for (const rename of traverseRenames) {
      applyUpdateTraverseByField(m, {
        traverseUuid: rename.traverseUuid,
        fieldName: "name",
        value: rename.newName,
      });
    }
  });
}

/**
 * Apply a batch of MDAU-driven station updates atomically.
 */
export function opApplyMdauStationUpdates(
  missionDocHandle: DocHandle<Mission>,
  stations: (Partial<
    Maegistro.MdauStation & {
      uuid: string;
    }
  > & {
    uuid: string;
  })[]
): void {
  const mission = missionDocHandle.doc();

  // Pre-compute traverse rename cascades for any name changes.
  const traverseRenames: TraverseRenameStageData[] = [];
  for (const partialMdauStation of stations) {
    if (partialMdauStation.name === undefined) continue;
    const renames = stageAdjacentTraverseRenames(mission, {
      stationUuid: partialMdauStation.uuid,
      newName: partialMdauStation.name,
    });
    if (renames) traverseRenames.push(...renames);
  }

  // One atomic .change() for the entire batch.
  missionDocHandle.change((m: Mission) => {
    // Update individual station fields.
    // Destructure away identifier fields; iterate the rest as mutable fields.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const { uuid, refUuid, rexUuid, ...mutableFields } of stations) {
      for (const [field, value] of Object.entries(mutableFields)) {
        applyUpdateStationByField(m, {
          stationUuid: uuid,
          fieldName: field as keyof Station,
          value: value as Station[keyof Station],
        });
      }
    }
    // Update the affected traverses
    for (const rename of traverseRenames) {
      applyUpdateTraverseByField(m, {
        traverseUuid: rename.traverseUuid,
        fieldName: "name",
        value: rename.newName,
      });
    }
  });

  return;
}
