import type { EntityManager } from "@mikro-orm/postgresql";

import { Station_db, Poi_db, Traverse_db } from "server/database/models/_allModels";
import ActionFactory from "../entityFactories/ActionFactory";
import EvaFactory from "../entityFactories/EVAFactory";
import FolderFactory from "../entityFactories/FolderFactory";
import GridFactory from "../entityFactories/GridFactory";
import LayerFactory from "../entityFactories/LayerFactory";
import PoiFactory from "../entityFactories/PoiFactory";
import PresetFactory from "../entityFactories/PresetFactory";
import RexFactory from "../entityFactories/RexFactory";
import StationFactory from "../entityFactories/StationFactory";
import STMLevel1Factory from "../entityFactories/STMLevel1Factory";
import STMLevel2Factory from "../entityFactories/STMLevel2Factory";
import STMLevel3Factory from "../entityFactories/STMLevel3Factory";
import STMRuleFactory from "../entityFactories/STMRuleFactory";
import SublayerFactory from "../entityFactories/SublayerFactory";
import TraverseFactory from "../entityFactories/TraverseFactory";

/**
 * Seeds a fully fleshed out mission in the database for testing.
 *
 * Creates all entity types and their relationships: stations, POIs, traverses,
 * actions (all relationship types including parentAction), EVAs with sequences
 * and egress/ingress locations, layers, sublayers, presets with sublayer controls,
 * grids, STM hierarchy (L1 → L2 → L3), STM rules, REX with entity references,
 * and folders for each entity type.
 *
 * @param em - Forked EntityManager to use for DB operations
 * @param missionId - The mission ID to associate all entities with
 * @param missionDocHandle - The automerge DocHandle for the mission (used to set activeGridUuid)
 */
export const missionTestSeeder = async (
  em: EntityManager,
  missionId: number,
  missionDocHandle: DocHandle<Mission>
): Promise<void> => {
  // ====== STATIONS ======
  const testStation = await new StationFactory(em).createOne({ missionId });
  const testStation2 = await new StationFactory(em).createOne({ missionId });

  // ====== POIs ======
  const testPoi = await new PoiFactory(em).createOne({ missionId });

  // ====== TRAVERSES ======
  const testTraverse = await new TraverseFactory(em).createOne({ missionId });
  const testTraverse2 = await new TraverseFactory(em).createOne({ missionId });

  // ====== ACTIONS (all relationship types) ======
  const stationAction = await new ActionFactory(em).createOne({
    missionId,
    station: testStation,
  });
  const poiAction = await new ActionFactory(em).createOne({ missionId, poi: testPoi });
  const traverseAction = await new ActionFactory(em).createOne({
    missionId,
    traverse: testTraverse,
  });
  // Station action with parentAction (original parent POI action)
  // it was derived from when duplicated into having a station parent
  await new ActionFactory(em).createOne({
    missionId,
    station: testStation2,
    parentAction: poiAction,
  });

  // ====== actionOrderUuids (required for action order remapping tests) ======
  await em.nativeUpdate(
    Station_db,
    { uuid: testStation.uuid },
    { actionOrderUuids: [stationAction.uuid] }
  );
  await em.nativeUpdate(Poi_db, { uuid: testPoi.uuid }, { actionOrderUuids: [poiAction.uuid] });
  await em.nativeUpdate(
    Traverse_db,
    { uuid: testTraverse.uuid },
    { actionOrderUuids: [traverseAction.uuid] }
  );

  // ====== EVA with sequence + non-lander egress/ingress ======
  const testEva = await new EvaFactory(em).createOne({
    missionId,
    sequence: [
      { type: "traverse", uuid: testTraverse.uuid },
      { type: "station", uuid: testStation.uuid },
      { type: "traverse", uuid: testTraverse2.uuid },
    ],
    egressLocationUuid: testStation.uuid,
    ingressLocationUuid: testStation2.uuid,
  });

  // ====== LAYERS + SUBLAYERS ======
  const testLayer = await new LayerFactory(em).createOne({ missionId });
  const [testSublayer] = await new SublayerFactory(em)
    .each((sl) => {
      sl.missionId = missionId;
      sl.layer = testLayer;
    })
    .create(1);

  // ====== PRESET with actual sublayer/layer references ======
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

  // ====== GRID (mark active on the mission doc) ======
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

  // ====== REX with actual entries referencing real entities ======
  await new RexFactory(em).createOne({
    missionId,
    evaUuid: testEva.uuid,
    stationEntries: { [testStation.uuid]: { rexStatus: "pending" } },
    traverseEntries: { [testTraverse.uuid]: { rexStatus: "pending" } },
    actionEntries: { [stationAction.uuid]: { rexStatus: "pending" } },
  });

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
