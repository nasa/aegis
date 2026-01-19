import * as httpClient_preset from "http-client/preset";
import * as httpClient_action from "http-client/action";
import * as httpClient_eva from "http-client/eva";
import * as httpClient_mission from "http-client/mission";
import * as httpClient_folder from "http-client/folder";
import * as httpClient_poi from "http-client/poi";
import * as httpClient_station from "http-client/station";
import * as httpClient_traverse from "http-client/traverse";

import isEqual from "lodash/isEqual";
import cloneDeep from "lodash/cloneDeep";
import clone from "lodash/clone";
import reduce from "lodash/reduce";
import { generateDefaultActionDefinitions } from "store/storeUtils/mission";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { convertNodeToHTML } from "components/interface/form/wysiwyg";

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
            opacity: sublayer.style.opacity ?? defaultSublayerStyle.opacity,
            contrast: sublayer.style.contrast ?? defaultSublayerStyle.contrast,
            brightness: sublayer.style.brightness ?? defaultSublayerStyle.brightness,
            saturation: sublayer.style.saturation ?? defaultSublayerStyle.saturation,
            blendMode: sublayer.style.blendMode ?? defaultSublayerStyle.blendMode,
            color: sublayer.style.color ?? defaultSublayerStyle.color,
            weight: sublayer.style.weight ?? defaultSublayerStyle.weight,
            fillColor: sublayer.style.fillColor ?? defaultSublayerStyle.fillColor,
            fillOpacity: sublayer.style.fillOpacity ?? defaultSublayerStyle.fillOpacity,
            isDashed: sublayer.style.isDashed ?? defaultSublayerStyle.isDashed,
            dashLen: sublayer.style.dashLen ?? defaultSublayerStyle.dashLen,
            altColor: sublayer.style.altColor ?? defaultSublayerStyle.altColor,
            altOpacity: sublayer.style.altOpacity ?? defaultSublayerStyle.altOpacity,
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
    const upsertResponse = await httpClient_preset.upsertPresets(presetsToSaveToDb);
    if (upsertResponse.status !== "success") {
      // handle the error
    }
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
   * Action STM UUID Audit
   * Audit the stm UUIDs on each action to ensure they still exist.
   * They may not exist if they were deleted from the admin side.
   */
  const stmLevel3Uuids = wholeStoreState.stm.level3s.map((i) => i.uuid);
  for (const action of newActions) {
    let isChanged = false;
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

  // update the store and db with the new values
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
    await httpClient_action.upsertActions(actionsToSaveToDb);
  }

  /**
   * Check any actions that do not exist on their parent object (traverse, station or poi) and remove them
   * This audit can be removed after its been pushed to production and all missions have been visited
   * This audit is to fix a one time bug
   */
  const actionUuidsToDelete: string[] = [];
  const allActionUuidsOnParents: string[] = [];

  // put all action uuids from parents into a single array for easy checking
  for (const poi of wholeStoreState.poi.pois) {
    if (poi.actionOrderUuids) allActionUuidsOnParents.push(...poi.actionOrderUuids);
  }
  for (const station of wholeStoreState.station.stations) {
    if (station.actionOrderUuids) allActionUuidsOnParents.push(...station.actionOrderUuids);
  }
  for (const traverse of wholeStoreState.traverse.traverses) {
    if (traverse.actionOrderUuids) allActionUuidsOnParents.push(...traverse.actionOrderUuids);
  }
  // check each action to see if it exists on a parent
  for (const action of newActions) {
    if (action.poiUuid && allActionUuidsOnParents.includes(action.uuid)) continue;
    if (action.stationUuid && allActionUuidsOnParents.includes(action.uuid)) continue;
    if (action.traverseUuid && allActionUuidsOnParents.includes(action.uuid)) continue;
    // action has no parent, remove it
    actionUuidsToDelete.push(action.uuid);
    console.log(
      `Audit Actions: Found orphaned action: ${action.uuid} - poiUuid: ${action.poiUuid} stationUuid: ${action.stationUuid} traverseUuid: ${action.traverseUuid}`
    );
  }
  // delete from database and store
  if (actionUuidsToDelete.length > 0) {
    console.log("Audit Actions: Deleting orphaned actions:", actionUuidsToDelete);
    // delete from store
    for (const actionUuid of actionUuidsToDelete) {
      const indexInActions = newActions.findIndex((a) => a.uuid === actionUuid);
      if (indexInActions >= 0) {
        newActions.splice(indexInActions, 1);
      }
    }
    wholeStoreState.action.actions = newActions;

    // delete from db
    const deleteResponse = await httpClient_action.deleteActions(actionUuidsToDelete);
    if (deleteResponse.status !== "success") {
      // handle the error
    }
  }
};

// This audit cannot be removed until new action v2 missions are created with default action definitions. Currently they are not.
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

/**
 * Strip out all slate and rich text formatting from the description fields
 *   and convert them into plaintext
 */
export const auditRichTextToText = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  const convertSlateToPlaintext = (description: string): string => {
    if (!description) return null;
    // Convert a string to a slate JSON object.
    let jsonSlateNodes;
    try {
      jsonSlateNodes = JSON.parse(description);
    } catch (e) {
      // If it's not in JSON form then it must be already a plain string
      return null;
    }

    // convert to html
    const html = reduce(
      jsonSlateNodes,
      (htmlString, decendant) => htmlString + convertNodeToHTML(decendant),
      ""
    );

    //Fixing a character encoding issue where % characters get double decoded
    const strippedHtml = html.replace(/%(?![0-9A-Fa-f]{2})/g, "%25");

    // convert to plaintext
    let plainText = decodeURIComponent(strippedHtml); // replace url encoded sequences

    // another decode to catch HTML encoded characters
    const plainTextElement = document.createElement("textarea");
    plainTextElement.innerHTML = plainText;
    plainText = plainTextElement.value;

    plainText = plainText.replace(/<br \/>/gm, "\n"); // replace all <br /> with newlines
    plainText = plainText.replace(/<\/p>/gm, "\n"); // replace all </p> with newlines
    plainText = plainText.replace(/<\/li>/gm, "\n"); // replace all </li> with newlines
    plainText = plainText.replace(/<[^>]*>?/gm, ""); // strip out rest of html tags

    return plainText;
  };

  //convert action descriptions
  const newActions = cloneDeep(wholeStoreState.action.actions);
  for (const action of newActions) {
    const newDescription = convertSlateToPlaintext(action.description);
    const newDescriptionTask = convertSlateToPlaintext(action.descriptionTask);
    if (newDescriptionTask) {
      action.descriptionTask = newDescriptionTask;
    }
    if (newDescription) {
      action.description = newDescription;
    }
  }
  if (!isEqual(newActions, wholeStoreState.action.actions)) {
    httpClient_action.upsertActions(newActions);
    wholeStoreState.action.actions = newActions;
  }

  //convert traverse descriptions
  const newTraverses = cloneDeep(wholeStoreState.traverse.traverses);
  for (const traverse of newTraverses) {
    const newDescription = convertSlateToPlaintext(traverse.description);
    if (newDescription) {
      traverse.description = newDescription;
    }
  }
  if (!isEqual(newTraverses, wholeStoreState.traverse.traverses)) {
    httpClient_traverse.upsertTraverses(newTraverses);
    wholeStoreState.traverse.traverses = newTraverses;
  }

  //convert EVA descriptions
  const newEVAs = cloneDeep(wholeStoreState.eva.evas);
  for (const eva of newEVAs) {
    const newDescription = convertSlateToPlaintext(eva.description);
    if (newDescription) {
      eva.description = newDescription;
    }
  }
  if (!isEqual(newEVAs, wholeStoreState.eva.evas)) {
    httpClient_eva.upsertEvas(newEVAs);
    wholeStoreState.eva.evas = newEVAs;
  }

  //convert action template descriptions
  const newMission = cloneDeep(wholeStoreState.mission.mission);
  for (const templateUuid in newMission.actionTemplates ?? {}) {
    const template = newMission.actionTemplates[templateUuid];
    const newDescription = convertSlateToPlaintext(template.description);
    if (newDescription) {
      template.description = newDescription;
    }
  }
  newMission.description = convertSlateToPlaintext(newMission.description);
  if (!isEqual(newMission, wholeStoreState.mission.mission)) {
    httpClient_mission.upsertMissions([newMission]);
    wholeStoreState.mission.mission = newMission;
  }

  //convert POI descriptions
  const newPOIs = cloneDeep(wholeStoreState.poi.pois);
  for (const poi of newPOIs) {
    const newDescription = convertSlateToPlaintext(poi.description);
    if (newDescription) {
      poi.description = newDescription;
    }
  }
  if (!isEqual(newPOIs, wholeStoreState.poi.pois)) {
    httpClient_poi.upsertPOIs(newPOIs);
    wholeStoreState.poi.pois = newPOIs;
  }

  //convert Preset descriptions
  const newPresets = cloneDeep(wholeStoreState.preset.presets);
  for (const preset of newPresets) {
    const newDescription = convertSlateToPlaintext(preset.description);
    if (newDescription) {
      preset.description = newDescription;
    }
  }
  if (!isEqual(newPresets, wholeStoreState.preset.presets)) {
    httpClient_preset.upsertPresets(newPresets);
    wholeStoreState.preset.presets = newPresets;
  }

  //convert Station descriptions
  const newStations = cloneDeep(wholeStoreState.station.stations);
  for (const station of newStations) {
    const newDescription = convertSlateToPlaintext(station.description);
    if (newDescription) {
      station.description = newDescription;
    }
  }
  if (!isEqual(newStations, wholeStoreState.station.stations)) {
    httpClient_station.upsertStations(newStations);
    wholeStoreState.station.stations = newStations;
  }
};

// Go through all the EVAs that belong to a REX and null out their name field
// This audit can be removed once all missions have been visited
export const auditRexEvaNames = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  const newEvas = cloneDeep(wholeStoreState.eva.evas);

  const evasToSaveToDb: Eva[] = [];
  for (const rex of wholeStoreState.rex.rexes) {
    // get eva for this rex and check if it needs to be set to null
    const eva = newEvas.find((eva) => eva.uuid === rex.evaUuid);
    if (eva && eva.name !== null) {
      eva.name = null;
      evasToSaveToDb.push({ ...eva, name: null });
    }
  }

  // save changes to store and db
  if (evasToSaveToDb.length > 0) {
    wholeStoreState.eva.evas = newEvas;
    const upsertResponse = await httpClient_eva.upsertEvas(evasToSaveToDb);
    if (upsertResponse.status !== "success") {
      console.error("Error saving REX EVA names for audit to DB:", upsertResponse.message);
    }
  }
};
