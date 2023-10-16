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
import { Traverse_db } from "server/database/models/_allModels";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { upsertLog } from "./log";

const handleTraverse: NextApiHandler<WrappedResponse<Traverse[] | Traverse>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    //check logged in
    if (!req.session?.user) {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }

    const { uuid, socketId, missionId, log } = req.query;
    const intMissionId = parseInt(missionId as string);
    const traverseUuid = uuid as string;
    const logAction = log === "true";

    //check for required mission id is valid
    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }
    const editPermission = await hasPerms(intMissionId, "edit", req.session?.user);

    if (req.method === "GET") {
      const viewPermission = await hasPerms(intMissionId, "view", req.session.user);
      if (!viewPermission && !editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }

      try {
        const traverses: Traverse[] = await getTraverses(intMissionId, traverseUuid);

        return res.status(200).json({
          status: "success",
          message: "Traverses retrieved",
          data: traverses,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }

    // upsert a traverse
    if (req.method === "POST") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const traverseToUpsert: Traverse = req.body as Traverse;
        const upsertResponse: Traverse = await upsertTraverse(traverseToUpsert);

        //check response
        if (!upsertResponse) {
          return res.status(500).json({
            status: "error",
            message: "Upsert response did not return a value",
            data: null,
          });
        } else {
          // emit the upserted item to all clients via socket.io
          emitStoreUpsert({
            missionId: intMissionId,
            socketId,
            type: "traverse",
            data: [upsertResponse],
          } as StoreUpsert<Traverse>);

          if (logAction) {
            // log this upsert to the log table
            upsertLog({
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "traverseUpsert",
              payloadJson: JSON.stringify(traverseToUpsert),
              createdAt: new Date().toISOString(),
            } as Log);
          }

          return res.status(200).json({
            status: "success",
            message: `Traverse upserted with ID ${upsertResponse.uuid}`,
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
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const deletedUuid = await deleteTraverse(traverseUuid);
        if (deletedUuid) {
          // emit the deleted item to all clients via socket.io
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "traverse",
            uuid: deletedUuid,
          } as StoreDelete);

          if (logAction) {
            // log this deletion to the log table
            upsertLog({
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "traverseDelete",
              payloadJson: JSON.stringify({ traverseUuid }),
              createdAt: new Date().toISOString(),
            } as Log);
          }

          return res.status(200).json({
            status: "success",
            message: "Traverse Deleted",
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
            message: "Cannot delete traverse. This Traverse is referenced elsewhere",
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
 * get Traverse(s) from the database
 * @param missionId required. Mission ID for the traverse.
 * @param traverseUuid optional. UUID of the traverse to retrieve
 * @returns array of traverses
 */
async function getTraverses(missionId: number, traverseUuid?: string): Promise<Traverse[]> {
  const em = getEM();

  //find traverses by either mission Id or uuid
  let dbtraverses: Loaded<Traverse_db, never>[];

  if (traverseUuid) {
    dbtraverses = await em.find(
      Traverse_db,
      { uuid: traverseUuid },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  } else {
    dbtraverses = await em.find(
      Traverse_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  }

  //convert foreign keys
  return convertTraverses(dbtraverses);
}

/**
 * Inserts or Updates a Traverse into the database
 * @param traverse the Traverse object to upsert
 * @returns a copy of the Traverse object that was upserted
 */
async function upsertTraverse(traverse: Traverse): Promise<Traverse> {
  const em = getEM();

  const traverseToUpsert = _.cloneDeep(traverse); //create a copy to manipulate

  const convertedTraverse: EntityData<Traverse_db> = {
    uuid: traverseToUpsert.uuid || uuidv4(),
    mission: traverseToUpsert.missionId,
    name: traverseToUpsert.name,
    path: traverseToUpsert.path,
    pathSegmentDistances: traverseToUpsert.pathSegmentDistances,
    pathSegmentElevations: traverseToUpsert.pathSegmentElevations,
    status: traverseToUpsert.status,
    predictedDurationLower: traverseToUpsert.predictedDurationLower,
    predictedDurationUpper: traverseToUpsert.predictedDurationUpper,
    description: traverseToUpsert.description,
    traverseRate: traverseToUpsert.traverseRate,
    rexStatus: traverseToUpsert.rexStatus,
    updatedAt: new Date(traverseToUpsert.updatedAt),
    createdAt: new Date(traverseToUpsert.createdAt),
  };

  //upsert traverse
  const traverseRefFromDb: Traverse_db = await em.upsert(Traverse_db, convertedTraverse);
  await em.persistAndFlush(traverseRefFromDb);

  //convert foreign keys
  return convertTraverses([traverseRefFromDb])[0];
}

/**
 * Deletes a single Traverse and the entity relationships to any POIs.
 * @param traverseUuid Traverse uuid to delete
 * @returns the uuid of the deleted Traverse, or null if nothing was deleted
 */
async function deleteTraverse(traverseUuid: string): Promise<string | null> {
  const em = getEM();
  let returnVal = traverseUuid;
  const entity = await em.findOne(Traverse_db, { uuid: traverseUuid });

  if (entity) {
    em.remove(entity); //delete traverse
    await em.flush(); //perform deletes
  } else {
    returnVal = null;
  }
  return returnVal;
}

/**
 * Converts db traverse fks to their plain uuid/id arrays
 * @param dbTraverses an array of Traverse in mikro db format
 * @returns an array of Traverse
 */
function convertTraverses(dbTraverses: Traverse_db[]): Traverse[] {
  const traverses: Traverse[] = [];
  for (const dbtraverse of dbTraverses) {
    //convert traverse object
    const convertedTraverse: Traverse = {
      uuid: dbtraverse.uuid,
      missionId: dbtraverse.mission.id,
      name: dbtraverse.name,
      path: dbtraverse.path,
      pathSegmentDistances: dbtraverse.pathSegmentDistances,
      pathSegmentElevations: dbtraverse.pathSegmentElevations,
      status: dbtraverse.status,
      predictedDurationLower: dbtraverse.predictedDurationLower,
      predictedDurationUpper: dbtraverse.predictedDurationUpper,
      description: dbtraverse.description,
      traverseRate: dbtraverse.traverseRate,
      rexStatus: dbtraverse.rexStatus,
      createdAt: dbtraverse.createdAt.toISOString(),
      updatedAt: dbtraverse.updatedAt.toISOString(),
    };
    traverses.push(convertedTraverse);
  }
  return traverses;
}

export default withIronSessionApiRoute(withORM(handleTraverse), ironOptions);
