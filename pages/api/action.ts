import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { getEM, withORM } from "utils/mikro";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { Action_db } from "server/database/models/_allModels";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { upsertLog } from "./log";

const handleAction: NextApiHandler<WrappedResponse<Action[] | Action>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { uuid, stationUuid, poiUuid, socketId, missionId, log } = req.query;
    const logAction = log === "true";
    const intMissionId = parseInt(missionId as string);
    const actionUuid = uuid as string;
    const station = stationUuid as string;
    const poi = poiUuid as string;
    //check for required mission id is valid
    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }

    const editPermission = await hasPerms(intMissionId, "edit", req.session.user);

    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session.user);
      if (!viewPermission && !editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const actions: Action[] = await getActions({
          missionId: intMissionId,
          actionUuid: actionUuid,
          stationUuid: station,
          poiUuid: poi,
        });

        return res.status(200).json({
          status: "success",
          message: "actions retrieved",
          data: actions,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }

    // upsert a action
    if (req.method === "POST") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const actionsToUpsert: Action[] = req.body as Action[];
        await upsertActions(actionsToUpsert);

        // emit the upserted item to all clients via socket.io
        emitStoreUpsert({
          missionId: intMissionId,
          socketId,
          type: "action",
          data: actionsToUpsert,
        } as StoreUpsert<Action>);

        if (logAction) {
          // log this upsert to the log table
          upsertLog({
            uuid: uuidv4(),
            missionId: intMissionId,
            type: "actionUpsert",
            payloadJson: JSON.stringify(actionsToUpsert),
            createdAt: new Date().toISOString(),
          } as Log);
        }

        return res.status(200).json({
          status: "success",
          message: `Action(s) upserted with Uuids ${actionsToUpsert.map((a) => a.uuid)}`,
          data: actionsToUpsert,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the POST request" });
      }
    }

    // delete a record
    if (req.method === "DELETE") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const deletedUuid = await deleteAction(actionUuid);
        if (deletedUuid) {
          // emit the deleted item to all clients via socket.io
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "action",
            uuid: deletedUuid,
          } as StoreDelete);

          if (logAction) {
            // log this deletion to the log table
            upsertLog({
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "actionDelete",
              payloadJson: JSON.stringify({ actionUuid }),
              createdAt: new Date().toISOString(),
            } as Log);
          }

          return res.status(200).json({
            status: "success",
            message: "Action Deleted",
          });
        } else {
          return res.status(404).json({
            status: "failure",
            message: "Record not found. Nothing deleted",
          });
        }
      } catch (e) {
        console.error(e);
        if (e instanceof ForeignKeyConstraintViolationException) {
          return res.status(500).json({
            status: "error",
            message: "Cannot delete action. This action is referenced elsewhere",
          });
        } else {
          return res
            .status(500)
            .json({ status: "error", message: "Error processing the DELETE request" });
        }
      }
    }
  } catch (e) {
    return res.status(500).json({ status: "error", message: "Error in query: " + e });
  }
};

/**
 * get action(s) from the database using filter options.
 * @param filter optional filters: actionUuid, poiUuid, stationUuid, or missionId. If no filter options are provided, all actions will be returned.
 * @returns array of actions
 */
async function getActions(filter: ActionFilterOptions): Promise<Action[]> {
  const em = getEM();

  //build filter where clause
  const whereClause: {
    uuid?: string;
    poi?: { uuid: string };
    station?: { uuid: string };
    mission?: { id: number };
  } = {};
  if (filter?.actionUuid) whereClause.uuid = filter.actionUuid;
  if (filter?.poiUuid) whereClause.poi = { uuid: filter.poiUuid };
  if (filter?.stationUuid) whereClause.station = { uuid: filter.stationUuid };
  if (filter?.missionId) whereClause.mission = { id: filter.missionId };

  const dbactions: Loaded<Action_db>[] = await em.find(
    Action_db,
    { ...whereClause },
    { orderBy: [{ name: QueryOrder.ASC }] }
  );

  //convert foreign keys
  const actions = convertActions(dbactions) as Action[];
  return actions;
}

/**
 * Inserts or Updates a action into the database
 * @param actions array of actions upsert
 * @returns a copy of the array of actions that was upserted
 */
async function upsertActions(actions: Action[]) {
  const em = getEM();

  const actionsToUpsert = _.cloneDeep(actions); //create a copy to manipulate
  //convert fks
  for (const actionToUpsert of actionsToUpsert) {
    const convertedRecord: EntityData<Action_db> = {
      uuid: actionToUpsert.uuid || uuidv4(),
      name: actionToUpsert.name,
      mission: actionToUpsert.missionId,
      poi: actionToUpsert.poiUuid,
      station: actionToUpsert.stationUuid,
      parentAction: actionToUpsert.parentActionUuid,
      parentCopyDate: actionToUpsert.parentCopyDate
        ? new Date(actionToUpsert.parentCopyDate)
        : null,
      priority: actionToUpsert.priority,
      stmUuidRefs: actionToUpsert.stmUuidRefs,
      type: actionToUpsert.type,
      description: actionToUpsert.description,
      icon: actionToUpsert.icon,
      location: actionToUpsert.location,
      elevation: actionToUpsert.elevation,
      durationLower: actionToUpsert.durationLower,
      durationUpper: actionToUpsert.durationUpper,
      equipmentItemsUsage: actionToUpsert.equipmentItemsUsage,
      geographicUnitsUsage: actionToUpsert.geographicUnitsUsage,
      mass: actionToUpsert.mass,
      status: actionToUpsert.status,
      enabled: actionToUpsert.enabled,
      crewAssigned: actionToUpsert.crewAssigned,
      rexStatus: actionToUpsert.rexStatus,
      updatedAt: new Date(actionToUpsert.updatedAt),
      createdAt: new Date(actionToUpsert.createdAt),
    };

    const upsertReference: Action_db = await em.upsert(Action_db, convertedRecord);
    em.persist(upsertReference);
  }

  await em.flush();
}

/**
 * Deletes a single action.
 * @param actionUuid action uuid to delete
 * @returns the uuid of the deleted action, or null if nothing was deleted
 */
async function deleteAction(actionUuid: string): Promise<string | null> {
  const em = getEM();
  let returnVal = actionUuid;
  const entity = await em.findOne(Action_db, { uuid: actionUuid });

  if (entity) {
    await em.removeAndFlush(entity);
  } else {
    returnVal = null;
  }
  return returnVal;
}

/**
 * Converts db action fks to their uuid/id arrays
 * @param dbactions an array of actions in mikro db format
 * @returns an a converted array of actions or a single action
 */
function convertActions(dbactions: Action_db[]): Action[] {
  const actions: Action[] = [];
  for (const dbaction of dbactions) {
    //convert mission and owner ids
    const convertedAction: Action = {
      uuid: dbaction.uuid,
      name: dbaction.name,
      missionId: dbaction.mission.id,
      poiUuid: dbaction.poi?.uuid,
      stationUuid: dbaction.station?.uuid,
      parentActionUuid: dbaction.parentAction?.uuid,
      parentCopyDate: dbaction.parentCopyDate?.toISOString(),
      priority: dbaction.priority,
      stmUuidRefs: dbaction.stmUuidRefs,
      type: dbaction.type,
      description: dbaction.description,
      icon: dbaction.icon,
      location: dbaction.location,
      elevation: dbaction.elevation,
      durationLower: dbaction.durationLower,
      durationUpper: dbaction.durationUpper,
      equipmentItemsUsage: dbaction.equipmentItemsUsage,
      geographicUnitsUsage: dbaction.geographicUnitsUsage,
      mass: dbaction.mass,
      status: dbaction.status,
      enabled: dbaction.enabled,
      crewAssigned: dbaction.crewAssigned,
      rexStatus: dbaction.rexStatus,
      createdAt: dbaction.createdAt?.toISOString(),
      updatedAt: dbaction.updatedAt?.toISOString(),
    };
    actions.push(convertedAction);
  }
  return actions;
}

export default withIronSessionApiRoute(withORM(handleAction), ironOptions);
