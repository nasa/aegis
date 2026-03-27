import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import type { EntityManager } from "@mikro-orm/postgresql";
import {
  Station_db,
  Poi_db,
  Action_db,
  Eva_db,
  Layer_db,
  Preset_db,
  Rex_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  Sublayer_db,
  Traverse_db,
  Grid_db,
  STM_Rule_db,
  Folder_db,
} from "server/database/models/_allModels";
import { getAccurateNow } from "utils/formatting";

import { createUuidMapping } from "./helpers";

// Duplicate/Restore Stations
export const processStations = (
  em: EntityManager,
  stations: Station_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const station of stations) {
    if (!station || !station.uuid) continue;

    const newUuid = createUuidMapping(station.uuid, uuidMaps.stations);

    const stationData = {
      ...station,
      uuid: newUuid,
      missionId,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    };

    delete stationData.action;
    delete stationData.poi;

    const newStation = em.create(Station_db, stationData);
    em.persist(newStation);
  }
};

// Duplicate/Restore POIs
export const processPois = (
  em: EntityManager,
  pois: Poi_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const poi of pois) {
    if (!poi || !poi.uuid) continue;

    const newUuid = createUuidMapping(poi.uuid, uuidMaps.pois);

    const poiData = {
      ...poi,
      uuid: newUuid,
      missionId,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    };

    delete poiData.station;

    const newPoi = em.create(Poi_db, poiData);
    em.persist(newPoi);
  }
};

// Update POI action order UUIDs
export const updatePoiActionOrder = async (
  em: EntityManager,
  pois: Poi_db[],
  uuidMaps: EntityMaps
): Promise<void> => {
  for (const poi of pois) {
    if (!poi || !poi.uuid || !poi.actionOrderUuids || !poi.actionOrderUuids.length) continue;

    const newPoiUuid = uuidMaps.pois.get(poi.uuid);
    if (!newPoiUuid) continue;

    const newPoi = await em.findOne(Poi_db, { uuid: newPoiUuid });
    if (!newPoi) continue;

    // Map the action UUIDs to their new values
    newPoi.actionOrderUuids = poi.actionOrderUuids.map(
      (actionUuid) => uuidMaps.actions.get(actionUuid) || actionUuid
    );

    em.persist(newPoi);
  }
};

// Duplicate/Restore Traverses
export const processTraverses = (
  em: EntityManager,
  traverses: Traverse_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const traverse of traverses) {
    if (!traverse || !traverse.uuid) continue;

    const newUuid = createUuidMapping(traverse.uuid, uuidMaps.traverses);

    const traverseData = {
      ...traverse,
      uuid: newUuid,
      missionId,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    };

    delete traverseData.action;

    const newTraverse = em.create(Traverse_db, traverseData);
    em.persist(newTraverse);
  }
};

// Update traverse action order UUIDs
export const updateTraverseActionOrder = async (
  em: EntityManager,
  traverses: Traverse_db[],
  uuidMaps: EntityMaps
): Promise<void> => {
  for (const traverse of traverses) {
    if (
      !traverse ||
      !traverse.uuid ||
      !traverse.actionOrderUuids ||
      !traverse.actionOrderUuids.length
    )
      continue;

    const newTraverseUuid = uuidMaps.traverses.get(traverse.uuid);
    if (!newTraverseUuid) continue;

    const newTraverse = await em.findOne(Traverse_db, { uuid: newTraverseUuid });
    if (!newTraverse) continue;

    // Map the action UUIDs to their new values
    newTraverse.actionOrderUuids = traverse.actionOrderUuids.map(
      (actionUuid) => uuidMaps.actions.get(actionUuid) || actionUuid
    );

    em.persist(newTraverse);
  }
};

// Update station action order UUIDs
export const updateStationActionOrder = async (
  em: EntityManager,
  stations: Station_db[],
  uuidMaps: EntityMaps
): Promise<void> => {
  for (const station of stations) {
    if (!station || !station.uuid || !station.actionOrderUuids || !station.actionOrderUuids.length)
      continue;

    const newStationUuid = uuidMaps.stations.get(station.uuid);
    if (!newStationUuid) continue;

    const newStation = await em.findOne(Station_db, { uuid: newStationUuid });
    if (!newStation) continue;

    // Map the action UUIDs to their new values
    newStation.actionOrderUuids = station.actionOrderUuids.map(
      (actionUuid) => uuidMaps.actions.get(actionUuid) || actionUuid
    );

    em.persist(newStation);
  }
};

// Duplicate/Restore Actions
export const processActions = (
  em: EntityManager,
  actions: Action_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const action of actions) {
    if (!action || !action.uuid) continue;

    const newUuid = createUuidMapping(action.uuid, uuidMaps.actions);

    // Create action with only the basic data, not attempting to set references yet
    const newAction = em.create(Action_db, {
      ...action,
      uuid: newUuid,
      missionId,
      // Remove relationship fields - we'll update these in updateActionRelationships
      poi: null,
      station: null,
      traverse: null,
      parentAction: null, // Handle parent action relationship
      createdAt: getAccurateNow().getTime(),
      updatedAt: getAccurateNow().getTime(),
    });
    em.persist(newAction);
  }
};

// Connect POIs to their stations
export const connectPoisToStations = async (
  em: EntityManager,
  originalPois: Poi_db[],
  uuidMaps: EntityMaps
): Promise<void> => {
  for (const poi of originalPois) {
    if (!poi || !poi.uuid) continue;

    const newPoiUuid = uuidMaps.pois.get(poi.uuid);
    if (!newPoiUuid) continue;

    const newPoiEntity = await em.findOne(Poi_db, { uuid: newPoiUuid });
    if (!newPoiEntity) continue;

    // Handle MikroORM Collection
    // First check if station collection exists and is initialized properly
    if (
      poi.station &&
      typeof poi.station === "object" &&
      typeof poi.station.isInitialized === "function" &&
      poi.station.isInitialized()
    ) {
      try {
        const stations = poi.station.getItems();
        for (const station of stations) {
          if (!station || !station.uuid) continue;

          const newStationUuid = uuidMaps.stations.get(station.uuid);
          if (newStationUuid) {
            const newStation = await em.findOne(Station_db, { uuid: newStationUuid });
            if (newStation) {
              newStation.poi.add(newPoiEntity);
              em.persist(newStation);
            }
          }
        }
      } catch (error) {
        serverLogger.warning({
          logId: "duplicate-entity",
          logValue: `Error processing collection for POI ${poi.uuid}: ${error}`,
        });
      }
    }
    // Handle array of stations (from restore JSON)
    else if (poi.station && Array.isArray(poi.station)) {
      for (const stationInfo of poi.station) {
        if (!stationInfo || !stationInfo.uuid) continue;

        const newStationUuid = uuidMaps.stations.get(stationInfo.uuid);
        if (newStationUuid) {
          const newStation = await em.findOne(Station_db, { uuid: newStationUuid });
          if (newStation) {
            newStation.poi.add(newPoiEntity);
            em.persist(newStation);
          }
        }
      }
    }
    // Station collection not properly initialized
    else if (poi.station) {
      serverLogger.warning({
        logId: "duplicate-entity",
        logValue: `POI ${poi.uuid} has station reference but it's not properly initialized or accessible`,
      });
    }
  }
};

// Update Action Relationships
export const updateActionRelationships = async (
  em: EntityManager,
  originalActions: Action_db[],
  uuidMaps: EntityMaps
): Promise<void> => {
  for (const action of originalActions) {
    if (!action || !action.uuid) continue;

    const newActionUuid = uuidMaps.actions.get(action.uuid);
    if (!newActionUuid) continue;

    const newActionEntity = await em.findOne(Action_db, { uuid: newActionUuid });
    if (!newActionEntity) continue;

    // Handle station relationship
    if (action.station?.uuid) {
      const newStationUuid = uuidMaps.stations.get(action.station.uuid);
      if (newStationUuid) {
        const newStation = await em.findOne(Station_db, { uuid: newStationUuid });
        if (newStation) {
          newActionEntity.station = newStation;
        }
      }
    }

    // Handle POI relationship
    if (action.poi?.uuid) {
      const newPoiUuid = uuidMaps.pois.get(action.poi.uuid);
      if (newPoiUuid) {
        const newPoi = await em.findOne(Poi_db, { uuid: newPoiUuid });
        if (newPoi) {
          newActionEntity.poi = newPoi;
        }
      }
    }

    // Handle traverse relationship
    if (action.traverse?.uuid) {
      const newTraverseUuid = uuidMaps.traverses.get(action.traverse.uuid);
      if (newTraverseUuid) {
        const newTraverse = await em.findOne(Traverse_db, { uuid: newTraverseUuid });
        if (newTraverse) {
          newActionEntity.traverse = newTraverse;
        }
      }
    }

    // Handle parentAction relationship
    if (action.parentAction?.uuid) {
      const newParentActionUuid = uuidMaps.actions.get(action.parentAction.uuid);
      if (newParentActionUuid) {
        const newParentAction = await em.findOne(Action_db, { uuid: newParentActionUuid });
        if (newParentAction) {
          newActionEntity.parentAction = newParentAction;
        }
      }
    }

    em.persist(newActionEntity);
  }
};

// Duplicate/Restore Layers
export const processLayers = (
  em: EntityManager,
  layers: Layer_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const layer of layers) {
    if (!layer || !layer.uuid) continue;

    const newUuid = createUuidMapping(layer.uuid, uuidMaps.layers);

    const newLayer = em.create(Layer_db, {
      ...layer,
      uuid: newUuid,
      missionId,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    });

    em.persist(newLayer);
  }
};

// Duplicate/Restore Sublayers
export const processSublayers = async (
  em: EntityManager,
  sublayers: Sublayer_db[],
  missionId: number,
  uuidMaps: EntityMaps
): Promise<void> => {
  // Step 1: First, find all the new layers we've created
  const layerUuidToEntity = new Map<string, Layer_db>();
  const allNewLayers = await em.find(Layer_db, { missionId });

  for (const layer of allNewLayers) {
    // Find the original layer UUID by looking through our maps
    for (const [oldUuid, newUuid] of uuidMaps.layers.entries()) {
      if (newUuid === layer.uuid) {
        layerUuidToEntity.set(oldUuid, layer);
        break;
      }
    }
  }

  // Step 2: Create sublayers with their layer references already set
  for (const sublayer of sublayers) {
    if (!sublayer || !sublayer.uuid) continue;

    const newUuid = createUuidMapping(sublayer.uuid, uuidMaps.sublayers);

    // Find the corresponding layer for this sublayer
    let layerEntity = null;
    if (sublayer.layer?.uuid) {
      layerEntity = layerUuidToEntity.get(sublayer.layer.uuid);
      if (!layerEntity) {
        serverLogger.warning({
          logId: "dup-entity",
          logValue: `Could not find layer with UUID ${sublayer.layer.uuid} for sublayer ${sublayer.uuid}`,
        });
        continue; // Skip this sublayer if we can't find its layer
      }
    } else {
      serverLogger.warning({
        logId: "dup-entity",
        logValue: `Sublayer ${sublayer.uuid} has no layer reference, skipping`,
      });
      continue; // Skip sublayers without layer references
    }

    // Create sublayer with its layer reference already set
    const newSublayer = em.create(Sublayer_db, {
      ...sublayer,
      uuid: newUuid,
      missionId,
      layer: layerEntity, // Set the layer reference immediately
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    });

    em.persist(newSublayer);
  }
};

// Update sublayer relationships
export const updateSublayerToLayerRelationships = async (
  em: EntityManager,
  originalSublayers: Sublayer_db[],
  uuidMaps: EntityMaps
): Promise<void> => {
  for (const sublayer of originalSublayers) {
    if (!sublayer || !sublayer.uuid || !sublayer.layer?.uuid) continue;

    const newSublayerUuid = uuidMaps.sublayers.get(sublayer.uuid);
    if (!newSublayerUuid) continue;

    const newSublayer = await em.findOne(Sublayer_db, { uuid: newSublayerUuid });
    if (!newSublayer) continue;

    const newLayerUuid = uuidMaps.layers.get(sublayer.layer.uuid);
    if (!newLayerUuid) continue;

    const newLayer = await em.findOne(Layer_db, { uuid: newLayerUuid });
    if (newLayer) {
      newSublayer.layer = newLayer;
      em.persist(newSublayer);
    }
  }
};

// Duplicate/Restore EVAs with updated references
export const processEvas = (
  em: EntityManager,
  evas: Eva_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const eva of evas) {
    if (!eva || !eva.uuid) continue;

    const newUuid = createUuidMapping(eva.uuid, uuidMaps.evas);

    // Update sequence items to point to the new UUIDs
    const newSequence = eva.sequence?.map((item) => {
      if (!item || !item.uuid) {
        return item; // Return unchanged if UUID is missing
      }

      if (item.type === "station") {
        const newStationUuid = uuidMaps.stations.get(item.uuid);
        return {
          ...item,
          uuid: newStationUuid || item.uuid,
        };
      } else if (item.type === "traverse") {
        const newTraverseUuid = uuidMaps.traverses.get(item.uuid);
        return {
          ...item,
          uuid: newTraverseUuid || item.uuid,
        };
      }
      return item;
    });

    // Handle egress location UUID
    let newEgressLocationUuid = eva.egressLocationUuid;
    if (eva.egressLocationUuid && eva.egressLocationUuid !== "lander") {
      newEgressLocationUuid =
        uuidMaps.stations.get(eva.egressLocationUuid) || eva.egressLocationUuid;
    }

    // Handle ingress location UUID
    let newIngressLocationUuid = eva.ingressLocationUuid;
    if (eva.ingressLocationUuid && eva.ingressLocationUuid !== "lander") {
      newIngressLocationUuid =
        uuidMaps.stations.get(eva.ingressLocationUuid) || eva.ingressLocationUuid;
    }

    const newEva = em.create(Eva_db, {
      ...eva,
      uuid: newUuid,
      missionId,
      sequence: newSequence,
      egressLocationUuid: newEgressLocationUuid,
      ingressLocationUuid: newIngressLocationUuid,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    });

    em.persist(newEva);
  }
};

// Duplicate/Restore Presets with updated references
export const processPresets = (
  em: EntityManager,
  presets: Preset_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const preset of presets) {
    if (!preset || !preset.uuid) continue;

    const newUuid = createUuidMapping(preset.uuid, uuidMaps.presets);

    // Map sublayer controls
    const newMapSublayerControls: Record<string, { sublayerUuid: string; [key: string]: unknown }> =
      {};
    if (preset.mapSublayerControls) {
      for (const [key, control] of Object.entries(preset.mapSublayerControls)) {
        // 'key' is the original sublayer UUID
        const newSublayerUuid = uuidMaps.sublayers.get(key);
        if (newSublayerUuid) {
          // Use the newSublayerUuid as the key for the new map
          // Also update the sublayerUuid property within the control object itself
          newMapSublayerControls[newSublayerUuid] = {
            ...control, // Spread the original control properties
            sublayerUuid: newSublayerUuid, // Ensure the property inside the object is also updated
          };
        } else {
          serverLogger.warning({
            logId: "dup-entity",
            logValue: `Sublayer ${key} not found in UUID map for preset ${preset.uuid}, skipping control`,
          });
        }
      }
    }

    // Handle layerOrder array
    let newLayerOrder = undefined;
    if (preset.layerOrder && Array.isArray(preset.layerOrder)) {
      newLayerOrder = preset.layerOrder
        .map((item) => {
          if (!item.layerUuid) return null;

          const newLayerUuid = uuidMaps.layers.get(item.layerUuid);
          if (!newLayerUuid) {
            serverLogger.warning({
              logId: "dup-entity",
              logValue: `Layer ${item.layerUuid} not found in UUID map for preset ${preset.uuid}, skipping layer order item`,
            });
            return null; // Skip if the layer UUID is not found
          }

          // Map sublayer UUIDs
          const newSublayerUuids =
            item.sublayerUuids
              ?.map((sublayerUuid) => {
                const mapped = uuidMaps.sublayers.get(sublayerUuid);
                if (!mapped) {
                  serverLogger.warning({
                    logId: "dup-entity",
                    logValue: `Sublayer ${sublayerUuid} not found in UUID map for preset ${preset.uuid} (layerOrder), skipping sublayer`,
                  });
                }
                return mapped;
              })
              .filter((uuid): uuid is string => !!uuid) || []; // Ensure only valid strings are kept

          return {
            layerUuid: newLayerUuid,
            sublayerUuids: newSublayerUuids,
          };
        })
        .filter((item): item is { layerUuid: string; sublayerUuids: string[] } => !!item); // Ensure only valid items are kept
    }

    const newPreset = em.create(Preset_db, {
      ...preset,
      uuid: newUuid,
      missionId,
      mapSublayerControls: newMapSublayerControls,
      layerOrder: newLayerOrder,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    });

    em.persist(newPreset);
  }
};

// Duplicate/Restore REXes with updated references
export const processRexes = (
  em: EntityManager,
  rexes: Rex_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const rex of rexes) {
    if (!rex || !rex.uuid) continue;

    const newUuid = createUuidMapping(rex.uuid, uuidMaps.rexes);

    const rexData = {
      ...rex,
      uuid: newUuid,
      missionId,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    };

    // Update eva UUID reference
    if (rex.evaUuid) {
      const newEvaUuid = uuidMaps.evas.get(rex.evaUuid);
      if (newEvaUuid) {
        rexData.evaUuid = newEvaUuid;
      }
    }

    // Update stationEntries
    if (rex.stationEntries) {
      const newStationEntries: DupStationEntries = {};
      for (const [stationUuid, entry] of Object.entries(rex.stationEntries)) {
        const newStationUuid = uuidMaps.stations.get(stationUuid);
        if (newStationUuid) {
          newStationEntries[newStationUuid] = entry;
        }
      }
      rexData.stationEntries = newStationEntries;
    }

    // Update traverseEntries
    if (rex.traverseEntries) {
      const newTraverseEntries: DupTraverseEntries = {};
      for (const [traverseUuid, entry] of Object.entries(rex.traverseEntries)) {
        const newTraverseUuid = uuidMaps.traverses.get(traverseUuid);
        if (newTraverseUuid) {
          newTraverseEntries[newTraverseUuid] = entry;
        }
      }
      rexData.traverseEntries = newTraverseEntries;
    }

    // Update actionEntries
    if (rex.actionEntries) {
      const newActionEntries: DupActionEntries = {};
      for (const [actionUuid, entry] of Object.entries(rex.actionEntries)) {
        const newActionUuid = uuidMaps.actions.get(actionUuid);
        if (newActionUuid) {
          newActionEntries[newActionUuid] = entry;
        }
      }
      rexData.actionEntries = newActionEntries;
    }

    const newRex = em.create(Rex_db, rexData);
    em.persist(newRex);
  }
};

// Duplicate/Restore STM entities
export const processStmEntities = async (
  em: EntityManager,
  stmLevel1s: STM_Level1_db[],
  stmLevel2s: STM_Level2_db[],
  stmLevel3s: STM_Level3_db[],
  missionId: number,
  uuidMaps: EntityMaps
): Promise<void> => {
  // Create a map to track original to new STM objects for establishing relationships
  const stm1Objects = new Map<string, STM_Level1_db>();
  const stm2Objects = new Map<string, STM_Level2_db>();
  const stm3Objects = new Map<string, STM_Level3_db>();

  // STM Level 1
  for (const stm1 of stmLevel1s) {
    if (!stm1 || !stm1.uuid) continue;

    const newUuid = createUuidMapping(stm1.uuid, uuidMaps.stmLevel1s);
    // Exclude the 'level2s' collection from the spread and prefix with underscore to satisfy linting
    const { level2s: _level2s, ...stm1Data } = stm1;
    const newStm1 = em.create(STM_Level1_db, {
      ...stm1Data,
      uuid: newUuid,
      missionId,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
      // level2s collection will be managed by MikroORM via the level2.level1 relationship
    });
    em.persist(newStm1);
    stm1Objects.set(stm1.uuid, newStm1);
  }

  // STM Level 2 - with proper level1 references
  for (const stm2 of stmLevel2s) {
    if (!stm2 || !stm2.uuid) continue;

    const newUuid = createUuidMapping(stm2.uuid, uuidMaps.stmLevel2s);

    // Exclude the 'level3s' collection from the spread
    const { level3s: _level3s, ...stm2Data } = stm2;
    // Create Level 2 without relationship initially
    const newStm2 = em.create(STM_Level2_db, {
      ...stm2Data,
      uuid: newUuid,
      level1: null, // Initially set to null
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
      // level3s collection will be managed by MikroORM via the level3.level2 relationship
    });

    // Find the corresponding new Level 1 object
    if (stm2.level1?.uuid) {
      const newLevel1 = stm1Objects.get(stm2.level1.uuid);
      if (newLevel1) {
        newStm2.level1 = newLevel1; // Set the proper reference
      } else {
        serverLogger.warning({
          logId: "dup-entity",
          logValue: `Could not find level1 with UUID ${stm2.level1.uuid} for level2 ${stm2.uuid}`,
        });
      }
    }

    em.persist(newStm2);
    stm2Objects.set(stm2.uuid, newStm2);
  }

  // STM Level 3 - with proper level2 references
  for (const stm3 of stmLevel3s) {
    if (!stm3 || !stm3.uuid) continue;

    const newUuid = createUuidMapping(stm3.uuid, uuidMaps.stmLevel3s);

    // Create Level 3 without relationship initially
    const newStm3 = em.create(STM_Level3_db, {
      ...stm3, // No collection property to exclude here
      uuid: newUuid,
      level2: null, // Initially set to null
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    });

    // Find the corresponding new Level 2 object
    if (stm3.level2?.uuid) {
      const newLevel2 = stm2Objects.get(stm3.level2.uuid);
      if (newLevel2) {
        newStm3.level2 = newLevel2; // Set the proper reference
      } else {
        serverLogger.warning({
          logId: "dup-entity",
          logValue: `Could not find level2 with UUID ${stm3.level2.uuid} for level3 ${stm3.uuid}`,
        });
      }
    }

    em.persist(newStm3);
    stm3Objects.set(stm3.uuid, newStm3); // Store the new L3 object if needed elsewhere
  }

  return;
};

// Duplicate/Restore STM Rules
export const processStmRules = async (
  em: EntityManager,
  stmRules: STM_Rule_db[],
  missionId: number,
  uuidMaps: EntityMaps
): Promise<void> => {
  if (!stmRules || stmRules.length === 0) {
    return;
  }

  // First, get all available STM Level 3 UUIDs in the new mission
  const allNewStmLevel3s = await em.find(STM_Level3_db, {
    level2: { level1: { missionId } },
  });

  const allNewStmUuids = new Set(allNewStmLevel3s.map((stm) => stm.uuid));

  for (const rule of stmRules) {
    if (!rule || !rule.uuid) {
      serverLogger.warning({ logId: "dup-entity", logValue: "Found rule without UUID, skipping" });
      continue;
    }

    const newUuid = createUuidMapping(rule.uuid, uuidMaps.stmRules);

    // Skip rules without STM UUID reference
    if (!rule.stmUuid) {
      serverLogger.warning({
        logId: "dup-entity",
        logValue: `Rule ${rule.uuid} has no stmUuid reference, skipping`,
      });
      continue;
    }

    // Try to map the stmUuid (always refers to L3)
    const newStmUuid = uuidMaps.stmLevel3s.get(rule.stmUuid);

    if (!newStmUuid) {
      serverLogger.warning({
        logId: "dup-entity",
        logValue: `Could not find mapped STM Level 3 UUID for rule ${rule.uuid} (${rule.stmUuid}). Skipping this rule.`,
      });
      continue;
    }

    // Double-check that the STM UUID exists in the new mission
    if (!allNewStmUuids.has(newStmUuid)) {
      serverLogger.warning({
        logId: "dup-entity",
        logValue: `Mapped STM UUID ${newStmUuid} does not exist in the new mission. Skipping this rule.`,
      });
      continue;
    }

    // Create and persist the rule
    try {
      const newRule = em.create(STM_Rule_db, {
        ...rule,
        uuid: newUuid,
        missionId,
        stmUuid: newStmUuid,
        createdAt: getAccurateNow().toISOString(),
        updatedAt: getAccurateNow().toISOString(),
      });

      em.persist(newRule);
    } catch (error) {
      serverLogger.error(
        { logId: "dup-entity", logValue: `Error creating STM rule ${rule.uuid}` },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
};

// Duplicate/Restore Grids
export const processGrids = (
  em: EntityManager,
  grids: Grid_db[],
  missionId: number,
  uuidMaps: EntityMaps
): string | undefined => {
  let newActiveGridUuid: string | undefined = undefined;

  for (const grid of grids) {
    if (!grid || !grid.uuid) continue;

    const newUuid = createUuidMapping(grid.uuid, uuidMaps.grids);

    if (grid.isActiveGrid) {
      newActiveGridUuid = newUuid;
    }

    const newGrid = em.create(Grid_db, {
      ...grid,
      uuid: newUuid,
      missionId,
    });
    em.persist(newGrid);
  }

  return newActiveGridUuid;
};

// Duplicate/Restore Folders
export const processFolders = (
  em: EntityManager,
  folders: Folder_db[],
  missionId: number,
  uuidMaps: EntityMaps
): void => {
  for (const folder of folders) {
    if (!folder || !folder.uuid) continue;

    const newUuid = createUuidMapping(folder.uuid, uuidMaps.folders);

    // Map item UUIDs based on folder type
    let newItems: string[] = [];
    if (folder.items && Array.isArray(folder.items)) {
      newItems = folder.items
        .map((itemUuid) => {
          let mappedUuid;
          switch (folder.type) {
            case "poi":
              mappedUuid = uuidMaps.pois.get(itemUuid);
              break;
            case "station":
              mappedUuid = uuidMaps.stations.get(itemUuid);
              break;
            case "eva":
              mappedUuid = uuidMaps.evas.get(itemUuid);
              break;
            case "preset":
              mappedUuid = uuidMaps.presets.get(itemUuid);
              break;
            case "layer":
              mappedUuid = uuidMaps.layers.get(itemUuid);
              break;
            default:
              serverLogger.warning({
                logId: "dup-entity",
                logValue: `Unknown folder type: ${folder.type}`,
              });
          }
          return mappedUuid;
        })
        .filter(Boolean) as string[];
    }

    const newFolder = em.create(Folder_db, {
      ...folder,
      uuid: newUuid,
      missionId,
      items: newItems,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    });
    em.persist(newFolder);
  }
};
