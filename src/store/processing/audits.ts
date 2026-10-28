import { getTerrainProfile, normalizeTerrainProfile } from "http-client/terrainProfile";

import { getAccurateNow } from "utils/formatting";
import { generateDefaultActionDefinitions } from "store/storeUtils/mission";
import type { DocHandle } from "@automerge/automerge-repo";
import { clientLogger } from "utils/logging/clientLogger";
import { withMissionChange } from "client/automergeDocHandles";

export const auditActions = async ({
  missionDocHandle,
}: {
  missionDocHandle: DocHandle<Mission>;
}): Promise<void> => {
  // Get actions from automerge doc
  const allActionRecords = missionDocHandle.doc()?.actions ?? {};
  const newActions = Object.values(allActionRecords);

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
      logId: "audit:orphanedActions:foundOrphanedActionWithoutParent",
      logValue: `Found orphaned action: ${action.uuid} - poiUuid: ${action.poiUuid} stationUuid: ${action.stationUuid} traverseUuid: ${action.traverseUuid}`,
    });
  }
  // delete from automerge doc
  if (actionUuidsToDelete.length > 0) {
    clientLogger.debug({
      logId: "audit:orphanedActions:deletingOrphanedActionsFromMissionDoc",
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

export const auditTraverseTerrainProfiles = async ({
  missionDocHandle,
}: {
  missionDocHandle: DocHandle<Mission>;
}): Promise<void> => {
  const mission = missionDocHandle.doc();
  if (mission.id === null) {
    throw new Error("Cannot audit terrain profiles for a mission without an ID");
  }
  const traversesToRepair = !mission.demFilePath
    ? []
    : Object.values(mission.traverses).flatMap((traverse) => {
        const { path, pathSegmentDistances } = traverse;
        if (
          traverse.pathSegmentAbsoluteSlopes != null ||
          path === null ||
          path.length < 2 ||
          pathSegmentDistances === null ||
          pathSegmentDistances.length !== path.length - 1
        ) {
          return [];
        }
        return [{ uuid: traverse.uuid, path, pathSegmentDistances }];
      });
  const repairedProfiles = new Map<string, TerrainProfile>();

  for (const traverse of traversesToRepair) {
    try {
      const response = await getTerrainProfile({
        missionId: mission.id,
        path: traverse.path,
        pathSegmentDistances: traverse.pathSegmentDistances,
        entityKey: traverse.uuid,
      });
      const profile =
        response.status === "success"
          ? normalizeTerrainProfile(response.data, traverse.path, traverse.pathSegmentDistances)
          : null;
      if (profile) repairedProfiles.set(traverse.uuid, profile);
    } catch (error) {
      clientLogger.error(
        {
          logId: "audit:missingTraverseProfiles:failedToGenerateTerrainProfileForTraverse",
          logValue: `Error generating terrain profile for traverse ${traverse.uuid}`,
        },
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  if (repairedProfiles.size === 0) return;

  withMissionChange((m: Mission) => {
    if (m.id !== mission.id) {
      throw new Error(
        `Cannot apply terrain-profile audit for mission ${mission.id}: active mission is ${m.id}`
      );
    }

    for (const traverse of traversesToRepair) {
      const profile = repairedProfiles.get(traverse.uuid);
      const currentTraverse = m.traverses[traverse.uuid];
      if (!profile) continue;
      if (!currentTraverse) {
        throw new Error(
          `Cannot apply terrain-profile audit: traverse ${traverse.uuid} was removed`
        );
      }
      currentTraverse.pathSegmentElevations = profile.elevationsMeters;
      currentTraverse.pathSegmentAbsoluteSlopes = profile.terrainSlopesDegrees;
    }
  });
};

/**
 * Normalize the server-file grid field on the mission doc. Grids moved from the legacy
 * `Grid_db` table + `activeGridUuid` pointer onto `mission.serverFileGrid`. This is a
 * safety-net for docs restored from backup or created before the server-side
 * migration ran. It never destroys recovery info: the legacy `activeGridUuid`
 * is only removed once real grid metadata is present (i.e. the server migration
 * has already populated `mission.serverFileGrid`).
 */
export const auditMissionGrid = async ({
  missionDocHandle,
}: {
  missionDocHandle: DocHandle<Mission>;
}): Promise<void> => {
  const mission = missionDocHandle.doc();
  const hasServerFileGrid = "serverFileGrid" in mission;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasLegacyGrid = "grid" in (mission as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasLegacyPointer = "activeGridUuid" in (mission as any);

  // Already normalized.
  if (hasServerFileGrid && !hasLegacyGrid && !hasLegacyPointer) return;

  withMissionChange((m: Mission) => {
    // Operate loosely: legacy docs may lack `serverFileGrid` or still carry `activeGridUuid`
    // even though the Mission type says otherwise.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mm = m as any;
    if (!("serverFileGrid" in mm)) mm.serverFileGrid = mm.grid ?? null;
    if ("grid" in mm) delete mm.grid;
    // Only drop the legacy pointer when real grid metadata exists, so a pending
    // server migration can still recover the grid from grid_db.
    if (mm.serverFileGrid !== null && "activeGridUuid" in mm) {
      delete mm.activeGridUuid;
    }
  });
};
