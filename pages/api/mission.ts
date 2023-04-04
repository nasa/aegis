import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import { withORM, getEM } from "utils/mikro";

import _ from "lodash";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { EntityData, ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/core";
import { roundDateToSecond } from "utils/formatting";

/**
 * /api/mission?missionId=
 *
 * API endpoint for mission
 *
 * The request method will determine what action to perform
 *    GET = get all, subset, or single record
 *      Optional URL parameters are:
 *        missionId=  mission ID number. If none is provided all missions are returned
 *    POST = upsert a mission (defined in POST body) into the DB
 *      A full mission object (with an ID for new missions) should be specified in the request body
 *    DELETE = delete the mission for a given missionId
 *       Required URL parameters are:
 *        missionId=  mission ID number
 */
const handleMission: NextApiHandler<WrappedResponse<Mission[] | Mission>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    if (req.session?.user) {
      const { missionId } = req.query;
      const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);

      // retrieve record
      if (req.method === "GET") {
        if (intMissionId && _.isNaN(intMissionId)) {
          return res.status(500).json({ status: "error", message: "Invalid mission ID" });
        }

        try {
          const records: Mission[] = await getMissions(intMissionId);

          return res.status(200).json({
            status: "success",
            message: "mission retrieved",
            data: records,
          });
        } catch (e) {
          console.error(e);
          return res
            .status(500)
            .json({ status: "error", message: "Error processing the GET request" });
        }
      }

      //upsert a record
      if (req.method === "POST") {
        try {
          //perform the upsert
          const upsertObject: Mission = req.body as Mission;
          const upsertResponse: Mission = await upsertMission(upsertObject);

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
              message: `Mission upserted with ID ${upsertResponse.id}`,
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

      //delete a mission record
      if (req.method === "DELETE") {
        if (!intMissionId || _.isNaN(intMissionId)) {
          return res.status(500).json({ status: "error", message: "Invalid mission ID" });
        }

        try {
          const deletedMissionId: number = await deleteMission(intMissionId);
          if (deletedMissionId) {
            return res.status(200).json({
              status: "success",
              message: "Mission Deleted",
            });
          } else {
            return res.status(404).json({
              status: "failure",
              message: "No record found. Nothing deleted",
            });
          }
        } catch (e) {
          console.error(e);
          if (e instanceof ForeignKeyConstraintViolationException) {
            return res.status(500).json({
              status: "error",
              message: "Cannot delete mission. This mission is referenced elsewhere",
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
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: "error", message: "Error in query" });
  }
};

/**
 * get mission(s) from the database
 * @param missionId the mission id. null will return all missions
 * @returns array of missions
 */
async function getMissions(missionId: number = null): Promise<Mission[]> {
  const em = getEM();

  const missions: Mission_db[] = missionId
    ? await em.find(Mission_db, { id: missionId })
    : await em.find(Mission_db, {}, { orderBy: [{ name: QueryOrder.ASC }] });

  return missions.map((mission: Mission_db) => {
    return {
      ...mission,
      createdAt: mission.createdAt.toISOString(),
      updatedAt: mission.updatedAt.toISOString(),
    } as Mission;
  });
}

/**
 * Inserts or Updates a mission into the database
 * @param mission the mission object to upsert
 * @returns a copy of the mission object that was upserted
 */
async function upsertMission(mission: Mission): Promise<Mission> {
  const em = getEM();

  const missionCopy: Mission = _.cloneDeep(mission);
  const upsertRecord: EntityData<Mission_db> = {
    ...missionCopy,
    updatedAt: new Date(missionCopy.updatedAt),
    createdAt: new Date(missionCopy.createdAt),
  };
  const updateDate = roundDateToSecond(new Date());
  upsertRecord.updatedAt = updateDate;

  if (mission.id) {
    //update record
    upsertRecord.version++;
    const upsertReference = await em.upsert(Mission_db, upsertRecord);
    await em.persistAndFlush(upsertReference);
    return {
      ...upsertReference,
      updatedAt: upsertReference.updatedAt.toISOString(),
      createdAt: upsertReference.createdAt.toISOString(),
    } as Mission;
  } else {
    //insert record.
    //Can't use "upsert" to insert a new record if there's no other unique column in the table
    delete upsertRecord.id; //attempting to insert with an id of null will throw a mikro error. remove the property completely so mikro can give us a new id.
    upsertRecord.version = 1;
    upsertRecord.createdAt = updateDate;
    const createReference = em.create(Mission_db, upsertRecord);
    await em.persistAndFlush(createReference);
    return {
      ...createReference,
      updatedAt: createReference.updatedAt.toISOString(),
      createdAt: createReference.createdAt.toISOString(),
    } as Mission;
  }
}

/**
 * Deletes a single mission
 * @param missionId mission ID to delete
 * @returns the id of the deleted mission or null if nothing was deleted
 */
async function deleteMission(missionId: number): Promise<number | null> {
  const em = getEM();
  let returnVal = missionId;
  const entity = await em.findOne(Mission_db, missionId);
  if (entity) {
    await em.removeAndFlush(entity);
  } else {
    returnVal = null;
  }
  return returnVal;
}

export default withIronSessionApiRoute(withORM(handleMission), ironOptions);
