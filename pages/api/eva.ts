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
import { Eva as Eva_db } from "server/database/models/eva.model";
import _ from "lodash";
import { roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";

const handleEva: NextApiHandler<WrappedResponse<Eva[] | Eva>> = async (
  req,
  res
): Promise<unknown> => {
  if (req.session?.user) {
    const isAdmin = req.session.user.permission.includes("admin"); // will evaluate true or false
    const { missionId, uuid } = req.query;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    const evaUuid = Array.isArray(uuid) ? uuid[0] : uuid;

    if (req.method === "GET") {
      //check for required mission id is valid
      if (!intMissionId || _.isNaN(intMissionId)) {
        return res.status(500).json({ status: "error", message: "Invalid mission ID" });
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
      try {
        if (!isAdmin) {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
        const evaToUpsert: Eva = req.body as Eva;
        const upsertResponse: Eva = await upsertEVAs(evaToUpsert);

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
            message: `EVA upserted with ID ${upsertResponse.uuid}`,
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
        if (!isAdmin) {
          return res.status(401).json({ status: "failure", message: "Unauthorized" });
        }
        const deletedUUID = await deleteEVA(evaUuid);
        if (deletedUUID) {
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
  } else {
    return res.status(401).json({ status: "failure", message: "Unauthorized" });
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
  const evas = convertEVAs(dbevas);
  return evas;
}

/**
 * Inserts or Updates a EVA into the database
 * @param eva the EVA object to upsert
 * @returns a copy of the EVA object that was upserted
 */
async function upsertEVAs(eva: Eva): Promise<Eva> {
  const em = getEM();

  const evaToUpsert = _.cloneDeep(eva); //create a copy to manipulate

  const updateDateString = roundDateToSecond(new Date()).toISOString();
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
    updatedAt: new Date(evaToUpsert.createdAt || updateDateString),
    createdAt: new Date(updateDateString),
  };

  //upsert eva
  const evaRefFromDb: Eva_db = await em.upsert(Eva_db, convertedEva);
  await em.persistAndFlush(evaRefFromDb);

  //convert foreign keys
  return convertEVAs([evaRefFromDb])[0];
}

/**
 * Deletes a single EVA and the entity relationships to any POIs.
 * @param evaUuid EVA uuid to delete
 * @returns the uuid of the deleted EVA, or null if nothing was deleted
 */
async function deleteEVA(evaUuid: string): Promise<string | null> {
  const em = getEM();
  let returnVal = evaUuid;
  const entity = await em.findOne(Eva_db, { uuid: evaUuid });

  if (entity) {
    em.remove(entity); //delete eva
    await em.flush(); //perform deletes
  } else {
    returnVal = null;
  }
  return returnVal;
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
      createdAt: dbeva.createdAt.toISOString(),
      updatedAt: dbeva.updatedAt.toISOString(),
    };
    evas.push(convertedEva);
  }
  return evas;
}

export default withIronSessionApiRoute(withORM(handleEva), ironOptions);
