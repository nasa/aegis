import type { EntityManager } from "@mikro-orm/postgresql";

import { generateFullMission, writeMissionDataToAutomergeDocHandle } from "./mission";

/**
 * Seeds a fully fleshed out mission in automerge for integration testing. Every mission
 * entity (including layers, presets, STM, and folders) lives in the mission document.
 *
 * @param _em - Forked EntityManager (kept for callers that also seed relational rows)
 * @param _missionId - The mission ID the doc listing assigned
 * @param missionDocHandle - The Automerge DocHandle for the mission
 */
export const seedDatabaseAndGenerateAutomergeMission = async (
  _em: EntityManager,
  _missionId: number,
  missionDocHandle: DocHandle<Mission>
): Promise<void> => {
  const mission = generateFullMission();
  writeMissionDataToAutomergeDocHandle(mission, missionDocHandle);

  // Grid metadata is stored on the Automerge mission doc
  missionDocHandle.change((doc: Mission) => {
    doc.serverFileGrid = {
      numRows: 10,
      numCols: 10,
      name: "Vitest Test Grid",
      fileName: "vitest-test-grid.json",
    };
  });
};
