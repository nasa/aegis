import * as httpClient_preset from "http-client/preset";
import * as httpClient_action from "http-client/action";
import * as httpClient_mission from "http-client/mission";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";

export const auditPresetsAgainstLayers = async ({
  wholeStoreState,
}: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  //fix and validate against modifications to layers/sublayers made in admin since this preset was last saved
  const newPresets = _.cloneDeep(wholeStoreState.preset.presets);

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
            opacity: sublayer.opacity || 1,
            contrast: 1,
            brightness: 1,
            saturation: 1,
            blendMode: "normal",
            color: sublayer.color || "#FFFFFF",
            weight: sublayer.weight || 1,
            fillColor: sublayer.fillColor || "#FFFFFF",
            fillOpacity: sublayer.fillOpacity || 0,
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
    const mapCircleControls: MapCircleControls = {};
    if (!preset.mapCircleControls) {
      preset.mapCircleControls = {};
    }

    wholeStoreState.mission.mission.landerRadii?.forEach((landerRadius) => {
      if (preset.mapCircleControls[landerRadius.uuid]) {
        mapCircleControls[landerRadius.uuid] = preset.mapCircleControls[landerRadius.uuid];
      } else {
        mapCircleControls[landerRadius.uuid] = {
          name: landerRadius.name,
          landerRadiusUuid: landerRadius.uuid,
          visible: false,
          style: {
            opacity: 1,
            contrast: 1,
            brightness: 1,
            saturation: 1,
            blendMode: "normal",
            color: "red",
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
    if (!_.isEqual(preset, wholeStoreState.preset.presets[index])) {
      presetsToSaveToDb.push(preset);
      // update the db copy of the preset in the store as well
      wholeStoreState.preset.presets[index] = preset;
      wholeStoreState.preset.presetsFromDb[index] = preset;
    }
  }
  if (presetsToSaveToDb.length > 0) {
    // upsert the changed Presets to the DB
    const upsertReponse = await httpClient_preset.upsertPresets(presetsToSaveToDb, false);
    if (upsertReponse.status !== "success") {
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
  const newActions = _.cloneDeep(wholeStoreState.action.actions);

  /**
   * Action STM UUID Refs Audit
   * Audit the stm UUID refs on each action to ensure they still exist.
   * They may not exist if they were deleted from the admin side.
   */
  const stmLevel3Uuids = wholeStoreState.stm.level3s.map((i) => i.uuid);
  for (const action of newActions) {
    if (!action.stmUuidRefs) continue;
    let newUuidRefs = _.clone(action.stmUuidRefs); //make a copy to splice from
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
      const newPriorities: StmPriorities = _.clone(action.stmPriorities); //make a copy to splice from
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
    if (action.stmPriorities) newPriorities = _.clone(action.stmPriorities); //make a copy to splice from
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
    if (!_.isEqual(action, wholeStoreState.action.actions[index])) {
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
    const newActionDefinitions = {
      verbs: [
        { uuid: uuidv4(), name: "Characterize", abbr: "charize" },
        { uuid: uuidv4(), name: "Describe", abbr: "describe" }, // same as "characterize"?
        { uuid: uuidv4(), name: "Deploy", abbr: "deploy" },
        { uuid: uuidv4(), name: "Measure", abbr: "measure" },
        { uuid: uuidv4(), name: "Observe", abbr: "observe" },
        { uuid: uuidv4(), name: "Photograph", abbr: "photo" },
        { uuid: uuidv4(), name: "Photograph: 360 Panorama", abbr: "p-pano" },
        { uuid: uuidv4(), name: "Photograph: Mosaic", abbr: "p-msc" },
        { uuid: uuidv4(), name: "Photograph: Nested Image", abbr: "p-nested" },
        { uuid: uuidv4(), name: "Photograph: Photometric Survey", abbr: "p-survey" },
        { uuid: uuidv4(), name: "Photograph: Stereo Mosaic", abbr: "p-stermosc" },
        { uuid: uuidv4(), name: "Photograph: Stereo Pair", abbr: "p-stereo" },
        { uuid: uuidv4(), name: "Place", abbr: "place" },
        { uuid: uuidv4(), name: "Sample: Chip", abbr: "s-chip" },
        { uuid: uuidv4(), name: "Sample: Double Drive Tube", abbr: "s-ddtube" },
        { uuid: uuidv4(), name: "Sample: Drive Tube", abbr: "s-dtube" },
        { uuid: uuidv4(), name: "Sample: Float", abbr: "s-float" },
        { uuid: uuidv4(), name: "Sample: Rake", abbr: "s-rake" },
        { uuid: uuidv4(), name: "Sample: Scoop", abbr: "s-scoop" },
        { uuid: uuidv4(), name: "Sample: Sealed Scoop", abbr: "s-sscoop" },
        { uuid: uuidv4(), name: "Sample: Skim", abbr: "s-skim" },
        { uuid: uuidv4(), name: "Sample: Trench", abbr: "s-trench" },
        { uuid: uuidv4(), name: "Sample: Sealed Skim", abbr: "s-sskim" },
        { uuid: uuidv4(), name: "Sample: Sealed Drive Tube", abbr: "s-sdtube" },
        { uuid: uuidv4(), name: "Sample: Sealed Double Drive Tube", abbr: "s-sddtube" },
        { uuid: uuidv4(), name: "Sample: Contact Sample", abbr: "s-contact" },
      ],

      nouns: [
        { uuid: uuidv4(), name: "Boulder", abbr: "boulder" },
        { uuid: uuidv4(), name: "Boulder Fillet", abbr: "boulderfillet" },
        { uuid: uuidv4(), name: "Contact", abbr: "contact" },
        { uuid: uuidv4(), name: "Crater Floor", abbr: "craterflr" },
        { uuid: uuidv4(), name: "Crater Rim", abbr: "craterrim" },
        { uuid: uuidv4(), name: "Geotechnical Properties", abbr: "geoprops" },
        { uuid: uuidv4(), name: "Impact Melt", abbr: "impactmelt" },
        { uuid: uuidv4(), name: "Regolith (any)", abbr: "regolith" },
        { uuid: uuidv4(), name: "Regolith (Disturbed)", abbr: "regdist" },
        { uuid: uuidv4(), name: "Regolith (Undisturbed)", abbr: "regundist" },
        { uuid: uuidv4(), name: "Station", abbr: "station" },
        { uuid: uuidv4(), name: "Trench (any)", abbr: "trench" },
        { uuid: uuidv4(), name: "Trench Floor", abbr: "trenchflr" },
        { uuid: uuidv4(), name: "Trench Wall", abbr: "trenchwall" },
      ],

      adjectives: [
        { uuid: uuidv4(), name: "Distal to Lander", abbr: "distalnder" },
        { uuid: uuidv4(), name: "Proximal to Lander", abbr: "proxlander" },
        { uuid: uuidv4(), name: "PSR", abbr: "psr" },
        { uuid: uuidv4(), name: "Shadow", abbr: "shadow" },
        { uuid: uuidv4(), name: "Terrain Type: cb", abbr: "cb" },
        { uuid: uuidv4(), name: "Terrain Type: ce", abbr: "ce" },
        { uuid: uuidv4(), name: "Terrain Type: icwf", abbr: "icwf" },
        { uuid: uuidv4(), name: "Terrain Type: icwd", abbr: "icwd" },
        { uuid: uuidv4(), name: "Terrain Type: uh1", abbr: "uh1" },
        { uuid: uuidv4(), name: "Terrain Type: uh2", abbr: "uh2" },
        { uuid: uuidv4(), name: "Geo Unit: A", abbr: "A" },
        { uuid: uuidv4(), name: "Geo Unit: B", abbr: "B" },
        { uuid: uuidv4(), name: "Geo Unit: C", abbr: "C" },
      ],
    };

    const newMission = {
      ...wholeStoreState.mission.mission,
      actionDefinitions: newActionDefinitions,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };

    // update the store with the new action definitions
    wholeStoreState = {
      ...wholeStoreState,
      mission: {
        ...wholeStoreState.mission,
        mission: newMission,
      },
    };

    // upsert the changes to the mission table in the db
    //save mission to db
    const upsertResponse = await httpClient_mission.upsertMissions([newMission]);
    if (upsertResponse.status !== "success") {
      // handle the error
    }
  }
};
