import * as httpClient_preset from "http-client/preset";
import * as httpClient_action from "http-client/action";
import * as httpClient_mission from "http-client/mission";
import * as httpClient_rex from "http-client/rex";
import * as httpClient_station from "http-client/station";
import * as httpClient_folder from "http-client/folder";
import isEqual from "lodash/isEqual";
import cloneDeep from "lodash/cloneDeep";
import clone from "lodash/clone";
import { generateDefaultActionDefinitions } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

export const auditPresetsAgainstLayers = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  //fix and validate against modifications to layers/sublayers made in admin since this preset was last saved
  const newPresets = cloneDeep(wholeStoreState.preset.presets);

  for (const preset of newPresets) {
    //sync up anything added/deleted missing from preset layer order
    if (preset.layerOrder) {
      //delete any header layers in layerOrder removed from mission
      const filteredNewLayerOrders = preset.layerOrder.filter((layerOrder) =>
        wholeStoreState.mission.layers.some((l) => l.uuid === layerOrder.layerUuid)
      );

      preset.layerOrder = filteredNewLayerOrders;

      //add any missing header layers and sublayers to layerOrder from mission
      for (const headerLayer of wholeStoreState.mission.layers) {
        const newHeaderLayerOrder = preset.layerOrder.find(
          (layerOrder) => layerOrder.layerUuid === headerLayer.uuid
        );
        const sublayersFiltered = wholeStoreState.mission.sublayers.filter(
          (sublayer) => sublayer.layerUuid === headerLayer.uuid
        );
        if (newHeaderLayerOrder) {
          //it exists, good. check sublayers
          //add any missing sublayers
          for (const sublayer of sublayersFiltered) {
            const hasSublayer = newHeaderLayerOrder.sublayerUuids.some(
              (uuid) => uuid === sublayer.uuid
            );
            if (!hasSublayer) {
              newHeaderLayerOrder.sublayerUuids.push(sublayer.uuid);
            }
          }

          //delete any removed sublayers
          const newSublayerUuids = newHeaderLayerOrder.sublayerUuids.filter((sublayerOrderUuid) =>
            sublayersFiltered.some((s) => s.uuid === sublayerOrderUuid)
          );
          newHeaderLayerOrder.sublayerUuids = newSublayerUuids;
        } else {
          //add missing header layer and all it's sublayers
          const tempLayerOrder = {
            layerUuid: headerLayer.uuid,
            sublayerUuids: sublayersFiltered.map((s) => s.uuid),
          };
          preset.layerOrder.push(tempLayerOrder);
        }
      }
    }

    //loop through sublayers, add any sublayers that are missing from preset map controls
    //  this happens when sublayers are added in mission after the preset was created
    for (const sublayer of wholeStoreState.mission.sublayers) {
      //add to sublayer control
      if (!Object.keys(preset.mapSublayerControls).includes(sublayer.uuid)) {
        preset.mapSublayerControls[sublayer.uuid] = {
          name: sublayer.name,
          sublayerUuid: sublayer.uuid,
          visible: false,
          style: {
            opacity: sublayer.style.opacity || 1,
            contrast: sublayer.style.contrast || 1,
            brightness: sublayer.style.brightness || 1,
            saturation: sublayer.style.saturation || 1,
            blendMode: sublayer.style.blendMode || "normal",
            color: sublayer.style.color || "#FFFFFF",
            weight: sublayer.style.weight || 1,
            fillColor: sublayer.style.fillColor || "#FFFFFF",
            fillOpacity: sublayer.style.fillOpacity || 0,
          },
        };
      }
    }

    //loop through preset mapSublayerControls and delete any sublayer data that no longer exist in mission
    //  this happens when sublayers are deleted in mission after the preset was created
    for (const sublayerUuid in preset.mapSublayerControls) {
      if (!wholeStoreState.mission.sublayers.some((s) => s.uuid === sublayerUuid)) {
        delete preset.mapSublayerControls[sublayerUuid];
      }
    }

    //set map circle controls
    if (!preset.mapCircleControls) {
      preset.mapCircleControls = {};
    }

    const mapCircleControls: MapCircleControls = {};
    wholeStoreState.mission.mission.circleDefinitions?.forEach((circleDef) => {
      if (preset.mapCircleControls[circleDef.uuid]) {
        mapCircleControls[circleDef.uuid] = preset.mapCircleControls[circleDef.uuid];
      } else {
        mapCircleControls[circleDef.uuid] = {
          name: circleDef.name,
          uuid: circleDef.uuid,
          visible: false,
          style: {
            opacity: 1,
            contrast: 1,
            brightness: 1,
            saturation: 1,
            blendMode: "normal",
            color: "#FFFFFF",
            weight: 1,
            fillColor: "none",
            fillOpacity: 0,
          },
        };
      }
    });

    preset.mapCircleControls = mapCircleControls;
  }

  // save changed presets to the DB
  const presetsToSaveToDb: Preset[] = [];
  for (const [index, preset] of newPresets.entries()) {
    if (!isEqual(preset, wholeStoreState.preset.presets[index])) {
      presetsToSaveToDb.push(preset);
      // update the db copy of the preset in the store as well
      wholeStoreState.preset.presets[index] = preset;
      wholeStoreState.preset.presetsFromDb[index] = preset;
    }
  }
  if (presetsToSaveToDb.length > 0) {
    // upsert the changed Presets to the DB
    const upsertReponse = await httpClient_preset.upsertPresets(presetsToSaveToDb);
    if (upsertReponse.status !== "success") {
      // handle the error
    }
  }
};

export const auditStationCircles = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  // new stores to hold the updated values to be persisted at the end of all the audits
  const newStations = cloneDeep(wholeStoreState.station.stations);

  for (const newStation of newStations) {
    if (!newStation.mapCircleControls) {
      newStation.mapCircleControls = {};
    }

    //set map circle controls
    const mapCircleControls: MapCircleControls = {};
    wholeStoreState.mission?.mission?.circleDefinitions?.forEach((circleDef) => {
      if (newStation.mapCircleControls[circleDef.uuid]) {
        mapCircleControls[circleDef.uuid] = newStation.mapCircleControls[circleDef.uuid];
      } else {
        mapCircleControls[circleDef.uuid] = {
          name: circleDef.name,
          uuid: circleDef.uuid,
          visible: false,
          style: {
            opacity: 1,
            contrast: 1,
            brightness: 1,
            saturation: 1,
            blendMode: "normal",
            color: "#FFFFFF",
            weight: 1,
            fillColor: "none",
            fillOpacity: 0,
          },
        };
      }
    });

    newStation.mapCircleControls = mapCircleControls;
  }

  // update the store and db with the new values
  wholeStoreState.station.stations = newStations;

  // if new values were found, save them to the db
  const dataChanged = !isEqual(newStations, wholeStoreState.station.stationsFromDb);

  if (!dataChanged) {
    return;
  }
  const upsertResponse = await httpClient_station.upsertStations(newStations);
  if (upsertResponse.status !== "success") {
    // handle the error
  }
};

export const auditActions = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  // new stores to hold the updated values to be persisted at the end of all the audits
  const newActions = cloneDeep(wholeStoreState.action.actions);

  /**
   * Action STM UUID Refs Audit
   * Audit the stm UUID refs on each action to ensure they still exist.
   * They may not exist if they were deleted from the admin side.
   */
  const stmLevel3Uuids = wholeStoreState.stm.level3s.map((i) => i.uuid);
  for (const action of newActions) {
    if (!action.stmUuidRefs) continue;
    let newUuidRefs = clone(action.stmUuidRefs); //make a copy to splice from
    let isChanged = false;
    for (const stmUuid of action.stmUuidRefs) {
      if (stmLevel3Uuids.indexOf(stmUuid) < 0) {
        //stm doesn't exist. remove it from our copy
        isChanged = true;
        newUuidRefs = newUuidRefs.filter((uuid) => uuid != stmUuid);
      }
    }
    if (isChanged) action.stmUuidRefs = newUuidRefs;

    // also check the action.stmPriorities and remove any that don't have a matching stmUuid
    if (action.stmPriorities) {
      const newPriorities: StmPriorities = clone(action.stmPriorities); //make a copy to splice from
      isChanged = false;
      for (const stmUuid of Object.keys(action.stmPriorities)) {
        if (stmLevel3Uuids.indexOf(stmUuid) < 0) {
          //stm doesn't exist. remove it from our copy
          isChanged = true;
          delete newPriorities[stmUuid];
        }
      }
      if (isChanged) action.stmPriorities = newPriorities;
    }
  }

  /**
   * Action stmPriorities Audit
   * Add stmPriorities for any missing stmUuidRefs and make the default priority 2
   * TODO: remove this when we remove the stmUuidRefs field from the db
   */
  for (const action of newActions) {
    if (!action.stmUuidRefs) continue;
    // if action.stmPriorities is null, create it
    let newPriorities: StmPriorities = {};
    if (action.stmPriorities) newPriorities = clone(action.stmPriorities); //make a copy to splice from
    let isChanged = false;
    for (const stmUuid of action.stmUuidRefs) {
      if (!newPriorities[stmUuid]) {
        isChanged = true;
        newPriorities[stmUuid] = 2;
      }
    }
    if (isChanged) action.stmPriorities = newPriorities;
  }

  // update the store and db with the new values

  // Actions
  const actionsToSaveToDb: Action[] = [];
  for (const [index, action] of newActions.entries()) {
    if (!isEqual(action, wholeStoreState.action.actions[index])) {
      actionsToSaveToDb.push(action);
      // update the db copy of the action in the store as well
      wholeStoreState.action.actions[index] = action;
      wholeStoreState.action.actionsFromDb[index] = action;
    }
  }
  if (actionsToSaveToDb.length > 0) {
    const upsertResponse = await httpClient_action.upsertActions(actionsToSaveToDb);
    if (upsertResponse.status !== "success") {
      // handle the error
    }
  }
};

export const auditActionDefinitions = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  // If action system v2 is enabled and the action definitions are blank, create a default set

  if (
    wholeStoreState.mission.mission.actionSystemVersion === 2 &&
    !wholeStoreState.mission.mission.actionDefinitions
  ) {
    const newMission = {
      ...wholeStoreState.mission.mission,
      actionDefinitions: generateDefaultActionDefinitions(),
    };

    // update the store with the new action definitions
    wholeStoreState.mission.mission = newMission;
    wholeStoreState.mission.missionFromDb = newMission;

    // upsert the changes to the mission table in the db
    //save mission to db
    const upsertResponse = await httpClient_mission.upsertMissions([newMission]);
    if (upsertResponse.status !== "success") {
      // handle the error
    }
  }
};

export const auditPosSources = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  if (wholeStoreState.rex.rexes.length === 0) return;

  // loop through all rexes and audit the posSources
  const newRexes = cloneDeep(wholeStoreState.rex.rexes);
  let isModified: boolean = false;

  const defaultPosSource = {
    uuid: uuidv4(),
    abbr: "T",
    name: "Task",
  };
  for (const rex of newRexes) {
    // if the posSources is empty, fill it with a default with just "Task" in it
    if (!rex.posSources || rex.posSources.length === 0) {
      isModified = true;
      rex.posSources = [defaultPosSource];

      // if the rex has no position entries, skip to the next rex
      if (!rex.posEntries) continue;

      // loop through every rex posEntry and add the default posSource if it doesn't exist
      for (const posEntry of rex?.posEntries) {
        if (!posEntry.posSourceUuid) {
          posEntry.posSourceUuid = defaultPosSource.uuid;
        }
      }
    }
  }

  // update the store and db with the new values
  wholeStoreState.rex.rexes = newRexes;

  if (isModified) {
    const upsertResponse = await httpClient_rex.upsertRexes(newRexes);
    if (upsertResponse.status !== "success") {
      // handle the error
    }
  }
};

export const auditFolders = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  // remove any folder items that don't exist in the store
  const newFolders = cloneDeep(wholeStoreState.interface.folders);
  const foldersToSaveToDb: Folder[] = [];

  for (const folder of newFolders) {
    let isModified = false;

    if (folder.items && folder.items.length > 0) {
      const originalItems = [...folder.items];

      // Filter items based on folder type
      switch (folder.type) {
        case "preset":
          folder.items = folder.items.filter((itemUuid) =>
            wholeStoreState.preset.presets.some((preset) => preset.uuid === itemUuid)
          );
          break;
        case "poi":
          folder.items = folder.items.filter((itemUuid) =>
            wholeStoreState.poi.pois.some((poi) => poi.uuid === itemUuid)
          );
          break;
        case "station":
          folder.items = folder.items.filter((itemUuid) =>
            wholeStoreState.station.stations.some((station) => station.uuid === itemUuid)
          );
          break;
        case "eva":
          folder.items = folder.items.filter((itemUuid) =>
            wholeStoreState.eva.evas.some((eva) => eva.uuid === itemUuid)
          );
          break;
        case "rex":
          folder.items = folder.items.filter((itemUuid) =>
            wholeStoreState.rex.rexes.some((rex) => rex.uuid === itemUuid)
          );
          break;
        case "layer":
          folder.items = folder.items.filter((itemUuid) =>
            wholeStoreState.mission.layers.some((layer) => layer.uuid === itemUuid)
          );
          break;
      }

      // Check if items changed
      if (!isEqual(originalItems, folder.items)) {
        isModified = true;
      }
    }

    // If modified, add to list to save to DB
    if (isModified) {
      foldersToSaveToDb.push(folder);
    }
  }

  // update the store with the new folders
  wholeStoreState.interface.folders = newFolders;

  // save changed folders to the DB
  if (foldersToSaveToDb.length > 0) {
    const upsertResponse = await httpClient_folder.upsertFolders(foldersToSaveToDb);
    if (upsertResponse.status !== "success") {
      console.error("Error saving folders to DB:", upsertResponse.message);
    }
  }
};
