import * as httpClient_preset from "http-client/preset";
import * as httpClient_folder from "http-client/folder";

import cloneDeep from "lodash/cloneDeep";
import clone from "lodash/clone";
import isEqual from "lodash/isEqual";
import { getAccurateNow } from "utils/formatting";
import { generateDefaultActionDefinitions } from "store/storeUtils/mission";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import type { DocHandle } from "@automerge/automerge-repo";
import { clientLogger } from "utils/logging/clientLogger";
import { withMissionChange } from "client/automergeDocHandles";

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
      const existingControl = preset.mapSublayerControls[sublayer.uuid];
      //add to sublayer control
      if (!existingControl) {
        preset.mapSublayerControls[sublayer.uuid] = {
          name: sublayer.name,
          sublayerUuid: sublayer.uuid,
          visible: false,
          style: { ...defaultSublayerStyle },
        };
      } else {
        // Backfill fields added after the preset was created while preserving custom values.
        const definedStyleValues = Object.fromEntries(
          Object.entries(existingControl.style ?? {}).filter(([, value]) => value != null)
        );
        const mergedStyle = { ...defaultSublayerStyle, ...definedStyleValues };
        if (mergedStyle.labelStrokeColor === "rgba(255,255,255,0.85)") {
          mergedStyle.labelStrokeColor = defaultSublayerStyle.labelStrokeColor;
        }
        if (!isEqual(existingControl.style, mergedStyle)) {
          existingControl.style = mergedStyle;
        }
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
  missionDocHandle,
}: {
  wholeStoreState: WholeStoreState;
  missionDocHandle: DocHandle<Mission>;
}): Promise<void> => {
  // Get actions from automerge doc
  const allActionRecords = missionDocHandle.doc()?.actions ?? {};
  const newActions = cloneDeep(Object.values(allActionRecords));

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

  // update automerge doc with changed actions
  for (const action of newActions) {
    const original = allActionRecords[action.uuid];
    if (!isEqual(action, original)) {
      withMissionChange((m: Mission) => {
        m.actions[action.uuid] = action;
      });
    }
  }

  /**
   * Check any actions that do not exist on their parent object (traverse, station or poi) and remove them
   * This audit can be removed after its been pushed to production and all missions have been visited
   * This audit is to fix a one time bug
   */
  const actionUuidsToDelete: string[] = [];
  const allActionUuidsOnParents: string[] = [];

  // put all action uuids from parents into a single array for easy checking
  for (const poi of Object.values(missionDocHandle.doc()?.pois ?? {})) {
    if (poi.actionOrderUuids) allActionUuidsOnParents.push(...poi.actionOrderUuids);
  }
  for (const station of Object.values(missionDocHandle.doc()?.stations ?? {})) {
    if (station.actionOrderUuids) allActionUuidsOnParents.push(...station.actionOrderUuids);
  }
  for (const traverse of Object.values(missionDocHandle.doc()?.traverses ?? {})) {
    if (traverse.actionOrderUuids) allActionUuidsOnParents.push(...traverse.actionOrderUuids);
  }
  // check each action to see if it exists on a parent
  for (const action of newActions) {
    if (action.poiUuid && allActionUuidsOnParents.includes(action.uuid)) continue;
    if (action.stationUuid && allActionUuidsOnParents.includes(action.uuid)) continue;
    if (action.traverseUuid && allActionUuidsOnParents.includes(action.uuid)) continue;
    // action has no parent, remove it
    actionUuidsToDelete.push(action.uuid);
    clientLogger.debug({
      logId: "audit",
      logValue: `Found orphaned action: ${action.uuid} - poiUuid: ${action.poiUuid} stationUuid: ${action.stationUuid} traverseUuid: ${action.traverseUuid}`,
    });
  }
  // delete from automerge doc
  if (actionUuidsToDelete.length > 0) {
    clientLogger.debug({
      logId: "audit",
      logValue: `Deleting orphaned actions: ${actionUuidsToDelete.join(", ")}`,
    });
    withMissionChange((m: Mission) => {
      for (const actionUuid of actionUuidsToDelete) {
        delete m.actions[actionUuid];
      }
    });
  }
};

// This audit cannot be removed until new action v2 missions are created with default action definitions. Currently they are not.
export const auditActionDefinitions = async ({
  missionDocHandle,
}: {
  missionDocHandle: DocHandle<Mission>;
}): Promise<void> => {
  const mission = missionDocHandle.doc();

  // If action system v2 is enabled and the action definitions are blank, create a default set
  if (mission.actionSystemVersion === 2 && !mission.actionDefinitions) {
    // save the changes to the mission automerge doc
    withMissionChange((m: Mission) => {
      m.actionDefinitions = generateDefaultActionDefinitions();
      m.updatedAt = getAccurateNow().getTime();
    });
  }
};

/**
 * Normalize the grid field on the mission doc. Grids moved from the legacy
 * `Grid_db` table + `activeGridUuid` pointer onto `mission.grid`. This is a
 * safety-net for docs restored from backup or created before the server-side
 * migration ran. It never destroys recovery info: the legacy `activeGridUuid`
 * is only removed once real grid metadata is present (i.e. the server migration
 * has already populated `mission.grid`).
 */
export const auditMissionGrid = async ({
  missionDocHandle,
}: {
  missionDocHandle: DocHandle<Mission>;
}): Promise<void> => {
  const mission = missionDocHandle.doc();
  const hasGrid = "grid" in mission;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasLegacyPointer = "activeGridUuid" in (mission as any);

  // Already normalized.
  if (hasGrid && !hasLegacyPointer) return;

  withMissionChange((m: Mission) => {
    // Operate loosely: legacy docs may lack `grid` or still carry `activeGridUuid`
    // even though the Mission type says otherwise.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mm = m as any;
    if (!("grid" in mm)) mm.grid = null;
    // Only drop the legacy pointer when real grid metadata exists, so a pending
    // server migration can still recover the grid from grid_db.
    if (mm.grid !== null && "activeGridUuid" in mm) {
      delete mm.activeGridUuid;
    }
  });
};

export const auditFolders = async ({
  wholeStoreState,
  missionDocHandle,
}: {
  wholeStoreState: WholeStoreState;
  missionDocHandle: DocHandle<Mission>;
}): Promise<void> => {
  // remove any folder items that don't exist in the store
  const newFolders = cloneDeep(wholeStoreState.interface.folders);
  const foldersToSaveToDb: Folder[] = [];
  const mission = missionDocHandle.doc();

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
          folder.items = folder.items.filter((itemUuid) => {
            const pois = mission?.pois ?? {};
            return itemUuid in pois;
          });
          break;
        case "station":
          folder.items = folder.items.filter((itemUuid) => {
            const stations = mission?.stations ?? {};
            return itemUuid in stations;
          });
          break;
        case "eva":
          folder.items = folder.items.filter((itemUuid) => {
            const evas = mission?.evas ?? {};
            return itemUuid in evas;
          });
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
      clientLogger.error(
        { logId: "audit", logValue: "Error saving folders to DB" },
        new Error(upsertResponse.message)
      );
    }
  }
};
