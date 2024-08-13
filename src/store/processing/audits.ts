import * as httpClient_preset from "http-client/preset";
import * as httpClient_action from "http-client/action";
import _ from "lodash";

export const auditPresetsAgainstLayers = async (params: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  const { wholeStoreState } = params;
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

export const auditActions = async (params: { wholeStoreState: WholeStoreState }): Promise<void> => {
  const { wholeStoreState } = params;
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
