import type { EntityManager } from "@mikro-orm/postgresql";

import FolderFactory from "./entityFactories/FolderFactory";
import GridFactory from "./entityFactories/GridFactory";
import LayerFactory from "./entityFactories/LayerFactory";
import PresetFactory from "./entityFactories/PresetFactory";
import STMLevel1Factory from "./entityFactories/STMLevel1Factory";
import STMLevel2Factory from "./entityFactories/STMLevel2Factory";
import STMLevel3Factory from "./entityFactories/STMLevel3Factory";
import STMRuleFactory from "./entityFactories/STMRuleFactory";
import SublayerFactory from "./entityFactories/SublayerFactory";
import { generateFullMission, writeMissionDataToAutomergeDocHandle } from "./mission";

/**
 * Seeds PostgreSQL with test data for the given mission.
 *
 * @param em - Forked EntityManager to use for DB operations
 * @param missionId - The mission ID to associate all records with
 * @param mission - The generated Mission object whose entity UUIDs are used for cross-references
 * @param missionDocHandle - The Automerge DocHandle (receives the active grid UUID)
 */
const seedMissionDatabaseFixtures = async (
  em: EntityManager,
  missionId: number,
  mission: Mission,
  missionDocHandle: DocHandle<Mission>
): Promise<void> => {
  const [testStation] = Object.values(mission.stations);
  const [testPoi] = Object.values(mission.pois);
  const [testEva] = Object.values(mission.evas);

  // ====== LAYERS + SUBLAYERS ======
  const testLayer = await new LayerFactory(em).createOne({ missionId });
  const [testSublayer] = await new SublayerFactory(em)
    .each((sl) => {
      sl.missionId = missionId;
      sl.layer = testLayer;
    })
    .create(1);

  // ====== PRESET wired to the real sublayer/layer ======
  await new PresetFactory(em).createOne({
    missionId,
    mapSublayerControls: {
      [testSublayer.uuid]: {
        name: testSublayer.name,
        sublayerUuid: testSublayer.uuid,
        visible: true,
        style: null,
      },
    },
    layerOrder: [{ layerUuid: testLayer.uuid, sublayerUuids: [testSublayer.uuid] }],
  });

  // ====== GRID — UUID written back to the Automerge mission doc ======
  const testGrid = await new GridFactory(em).createOne({ missionId });
  missionDocHandle.change((doc: Mission) => {
    doc.activeGridUuid = testGrid.uuid;
  });

  // ====== STM HIERARCHY (L1 → L2 → L3) ======
  const stmLevel1 = await new STMLevel1Factory(em).createOne({ missionId });
  const [stmLevel2] = await new STMLevel2Factory(em)
    .each((l2) => {
      l2.level1 = stmLevel1;
    })
    .create(1);
  const [stmLevel3] = await new STMLevel3Factory(em)
    .each((l3) => {
      l3.level2 = stmLevel2;
    })
    .create(1);

  // ====== STM RULE ======
  await new STMRuleFactory(em).createOne({ missionId, stmUuid: stmLevel3.uuid });

  // ====== FOLDERS (station, poi, eva types) ======
  await new FolderFactory(em).createOne({
    missionId,
    name: "Vitest Station Folder",
    type: "station",
    items: [testStation.uuid],
  });
  await new FolderFactory(em).createOne({
    missionId,
    name: "Vitest POI Folder",
    type: "poi",
    items: [testPoi.uuid],
  });
  await new FolderFactory(em).createOne({
    missionId,
    name: "Vitest EVA Folder",
    type: "eva",
    items: [testEva.uuid],
  });
};

/**
 * Seeds a fully fleshed out mission in automerge and the
 * database for integration testing.
 *
 * @param em - Forked EntityManager to use for DB operations
 * @param missionId - The mission ID to associate all entities with
 * @param missionDocHandle - The Automerge DocHandle for the mission
 */
export const seedDatabaseAndGenerateAutomergeMission = async (
  em: EntityManager,
  missionId: number,
  missionDocHandle: DocHandle<Mission>
): Promise<void> => {
  const mission = generateFullMission();
  writeMissionDataToAutomergeDocHandle(mission, missionDocHandle);
  await seedMissionDatabaseFixtures(em, missionId, mission, missionDocHandle);
};
