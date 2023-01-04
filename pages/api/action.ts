import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { ForeignKeyConstraintViolationException, Loaded, QueryOrder } from "@mikro-orm/core";
import { Action as Action_db } from "server/database/models/action.model";
import _ from "lodash";
import { roundDateToSecond } from "utils/formatting";

export const handleAction: NextApiHandler<WrappedResponse<Action[] | Action>> = async (
  req,
  res
): Promise<unknown> => {
  if (req.session?.user) {
    const { missionId, uuid, stationUuid, poiUuid } = req.query;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    const actionUUID = Array.isArray(uuid) ? uuid[0] : uuid;

    if (req.method === "GET") {
      const station = Array.isArray(stationUuid) ? stationUuid[0] : stationUuid;
      const poi = Array.isArray(poiUuid) ? poiUuid[0] : poiUuid;

      try {
        const actions: Action[] = await getActions({
          missionId: intMissionId,
          actionUuid: actionUUID,
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
      try {
        const actionToUpsert: Action = req.body as Action;
        const upsertResponse: Action = await upsertAction(actionToUpsert);

        //check response
        if (!upsertResponse) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          return res.status(200).json({
            status: "success",
            message: `Action upserted with ID ${upsertResponse.uuid}`,
            data: upsertResponse,
          });
        }
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the POST request" });
      }
    }

    // delete a record
    if (req.method === "DELETE") {
      try {
        const deletedUUID = await deleteAction(actionUUID);
        if (deletedUUID) {
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
  } else {
    return res.status(401).json({ status: "failure", message: "Unauthorized" });
  }
};

/**
 * get action(s) from the database using filter options.
 * @param filter optional filters: actionUuid, poiId, stationUuid, or missionId. If no filter options are provided, all actions will be returned.
 * @returns array of actions
 */
export async function getActions(filter: ActionFilterOptions): Promise<Action[]> {
  await Mikro.getORM();
  const em = Mikro.getEM();

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
 * @param action the action object to upsert
 * @returns a copy of the action object that was upserted
 */
export async function upsertAction(action: Action): Promise<Action> {
  await Mikro.getORM();
  const em = Mikro.getEM();

  const actionToUpsert = _.cloneDeep(action); //create a copy to manipulate
  const updateDate = roundDateToSecond(new Date()); //db does not store miliseconds
  actionToUpsert.updatedAt = updateDate;
  actionToUpsert.createdAt = actionToUpsert.createdAt || updateDate;

  //convert fks
  const convertedRecord = {
    ...actionToUpsert,
    mission: actionToUpsert.missionId,
    poi: actionToUpsert.poiUuid,
    station: actionToUpsert.stationUuid,
  };
  delete convertedRecord.missionId;
  delete convertedRecord.poiUuid;
  delete convertedRecord.stationUuid;

  const upsertReference: Action_db = await em.upsert(Action_db, convertedRecord);
  await em.persistAndFlush(upsertReference);
  await Mikro.closeORM();

  //convert foreign keys
  const convertedAction = convertActions(upsertReference) as Action;
  return convertedAction;
}

/**
 * Deletes a single action.
 * @param actionUuid action uuid to delete
 * @returns the uuid of the deleted action, or null if nothing was deleted
 */
export async function deleteAction(actionUuid: string): Promise<string | null> {
  await Mikro.getORM();
  const em = Mikro.getEM();
  let returnVal = actionUuid;
  const entity = await em.findOne(Action_db, { uuid: actionUuid });

  if (entity) {
    await em.removeAndFlush(entity);
  } else {
    returnVal = null;
  }
  await Mikro.closeORM();
  return returnVal;
}

/**
 * Converts db action fks to their uuid/id arrays
 * @param dbactions an array of actions, or a single action in mikro db format
 * @returns an a converted array of actions or a single action
 */
export function convertActions(dbactions: Action_db[] | Action_db): Action[] | Action {
  if (Array.isArray(dbactions)) {
    const actions: Action[] = [];
    for (const dbaction of dbactions) {
      //convert mission and owner ids
      const convertedAction: any = {
        ...dbaction,
        missionId: dbaction.mission.id,
        poiUuid: dbaction.poi?.uuid,
        stationUuid: dbaction.station?.uuid,
      };
      delete convertedAction.mission;
      delete convertedAction.poi;
      delete convertedAction.station;

      actions.push(convertedAction);
    }
    return actions;
  } else {
    const convertedAction = {
      ...dbactions,
      missionId: dbactions.mission.id,
      poiUuid: dbactions.poi?.uuid,
      stationUuid: dbactions.station?.uuid,
    };
    delete convertedAction.mission;
    delete convertedAction.poi;
    delete convertedAction.station;
    return convertedAction;
  }
}

export default withIronSessionApiRoute(Mikro.withORM(handleAction), ironOptions);
