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
