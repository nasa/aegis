import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";
import {
  EntityData,
  ForeignKeyConstraintViolationException,
  Loaded,
  QueryOrder,
} from "@mikro-orm/core";
import { Eva_db } from "server/database/models/_allModels";
import _ from "lodash";
import { v4 as uuidv4 } from "uuid";
import { hasPerms } from "utils/permissions";
import { emitStoreDelete, emitStoreUpsert } from "./socketio";
import { upsertLogs } from "./log";

const handleEva: NextApiHandler<WrappedResponse<Eva[] | Eva>> = async (
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
    const evaUuid = uuid as string;
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
        const evas: Eva[] = await getEVAs(intMissionId, evaUuid);

        return res.status(200).json({
          status: "success",
          message: "EVAs retrieved",
          data: evas,
        });
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ status: "error", message: "Error processing the GET request" });
      }
    }

    // upsert a eva
    if (req.method === "POST") {
      if (!editPermission) {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
      try {
        const evas: Eva[] = req.body as Eva[];
        //add owner id to the evas
        const evasToUpsert = evas.map((e) => {
          if (!e.ownerId) {
            return { ...e, ownerId: req.session.user.id };
          } else {
            return e;
          }
        });
        const upsertResponse: Eva[] = await upsertEVAs(evasToUpsert);

        //check response
        if (upsertResponse.length === 0) {
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
            type: "eva",
            data: upsertResponse,
          } as StoreUpsert<Eva>);
          if (logAction) {
            // log this upsert to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "evaUpsert",
              payloadJson: JSON.stringify(evasToUpsert),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: `EVAs upserted with Uuids ${upsertResponse.map((e) => e.uuid)}`,
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
        const uuidsToDelete: string[] = req.body;
        const deletedUuids = await deleteEVAs(uuidsToDelete);
        if (deletedUuids.length > 0) {
          // emit the deleted item to all clients via socket.io
          emitStoreDelete({
            missionId: intMissionId,
            socketId,
            type: "eva",
            uuids: deletedUuids,
          } as StoreDelete);
          if (logAction) {
            // log this deletion to the log table
            const log: Log = {
              uuid: uuidv4(),
              missionId: intMissionId,
              type: "evaDelete",
              payloadJson: JSON.stringify({ uuidsToDelete }),
              createdAt: new Date().toISOString(),
            };
            upsertLogs([log]);
          }

          return res.status(200).json({
            status: "success",
            message: "EVA Deleted",
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
            message: "Cannot delete eva. This EVA is referenced elsewhere",
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
 * get EVA(s) from the database
 * @param missionId required. Mission ID for the eva.
 * @param evaUuid optional. UUID of the eva to retrieve
 * @returns array of evas
 */
async function getEVAs(missionId: number, evaUuid?: string): Promise<Eva[]> {
  const em = getEM();

  //find evas by either mission Id or uuid
  let dbevas: Loaded<Eva_db, never>[];

  if (evaUuid) {
    dbevas = await em.find(Eva_db, { uuid: evaUuid }, { orderBy: [{ name: QueryOrder.ASC }] });
  } else {
    dbevas = await em.find(
      Eva_db,
      { mission: { id: missionId } },
      { orderBy: [{ name: QueryOrder.ASC }] }
    );
  }

  //convert foreign keys
  return convertEVAs(dbevas);
}

/**
 * Inserts or Updates EVAs into the database
 * @param evas the EVA objects to upsert
 * @returns a copy of the EVA objects that was upserted
 */
async function upsertEVAs(evas: Eva[]): Promise<Eva[]> {
  const em = getEM();

  const evasToUpsert = _.cloneDeep(evas); //create a copy to manipulate
  const evasUpsertedToDb = [];

  for (const evaToUpsert of evasToUpsert) {
    const convertedEva: EntityData<Eva_db> = {
      uuid: evaToUpsert.uuid || uuidv4(),
      owner: evaToUpsert.ownerId,
      mission: evaToUpsert.missionId,
      name: evaToUpsert.name,
      status: evaToUpsert.status,
      sequence: evaToUpsert.sequence,
      description: evaToUpsert.description,
      maxDuration: evaToUpsert.maxDuration,
      traverseRate: evaToUpsert.traverseRate,
      egressDuration: evaToUpsert.egressDuration,
      ingressDuration: evaToUpsert.ingressDuration,
      egressLocationUuid: evaToUpsert.egressLocationUuid,
      ingressLocationUuid: evaToUpsert.ingressLocationUuid,
      updatedAt: new Date(evaToUpsert.updatedAt),
      createdAt: new Date(evaToUpsert.createdAt),
    };

    //upsert eva
    const evaRefFromDb: Eva_db = await em.upsert(Eva_db, convertedEva);
    em.persist(evaRefFromDb);
    evasUpsertedToDb.push(evaRefFromDb);
  }

  await em.flush();
  //convert foreign keys
  return convertEVAs(evasUpsertedToDb);
}

/**
 * Deletes a EVAs and the entity relationships to any POIs.
 * @param evaUuids EVA uuids to delete
 * @returns the uuids of the deleted EVA
 */
async function deleteEVAs(evaUuids: string[]): Promise<string[]> {
  const em = getEM();
  const deletedUuids = [];
  for (const evaUuid of evaUuids) {
    const entity = await em.findOne(Eva_db, { uuid: evaUuid });
    if (entity) {
      em.remove(entity); //delete eva
      deletedUuids.push(evaUuid);
    }
  }
  await em.flush(); //perform deletes
  return deletedUuids;
}

/**
 * Converts db eva fks to their plain uuid/id arrays
 * @param dbevas an array of EVA in mikro db format
 * @returns an array of EVA
 */
function convertEVAs(dbevas: Eva_db[]): Eva[] {
  const evas: Eva[] = [];
  for (const dbeva of dbevas) {
    //convert eva object
    const convertedEva: Eva = {
      uuid: dbeva.uuid,
      ownerId: dbeva.owner.id,
      missionId: dbeva.mission.id,
      name: dbeva.name,
      status: dbeva.status,
      sequence: dbeva.sequence,
      description: dbeva.description,
      maxDuration: dbeva.maxDuration,
      traverseRate: dbeva.traverseRate,
      egressDuration: dbeva.egressDuration,
      ingressDuration: dbeva.ingressDuration,
      egressLocationUuid: dbeva.egressLocationUuid,
      ingressLocationUuid: dbeva.ingressLocationUuid,
      createdAt: dbeva.createdAt.toISOString(),
      updatedAt: dbeva.updatedAt.toISOString(),
    };
    evas.push(convertedEva);
  }
  return evas;
}

export default withIronSessionApiRoute(withORM(handleEva), ironOptions);
