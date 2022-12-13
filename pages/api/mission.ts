import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import _ from "lodash";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { ForeignKeyConstraintViolationException, QueryOrder } from "@mikro-orm/core";

/**
 * /api/mission?missionId=
 *
 * API endpoint for mission
 *
 * The request method will determine what action to perform
 *    GET = get all, subset, or single record
 *      Required URL parameters are:
 *        missionId=  mission ID number
 *    POST = upsert a mission (defined in POST body) into the DB
 *      A full mission object (with an ID for new missions) should be specified in the request body
 *    DELETE = delete the mission for a given missionId
 *       Required URL parameters are:
 *        missionId=  mission ID number
 */
export async function handleMission(req: NextApiRequest, res: NextApiResponse): Promise<unknown> {
  try {
    if (req.session?.user) {
      const { missionId } = req.query;

      const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
      if (intMissionId && _.isNaN(intMissionId)) {
        return res.status(500).json({ status: "error", message: "Invalid mission ID" });
      }

      // retrieve record
      if (req.method === "GET") {
        try {
          const records: Mission[] = await getMissions(intMissionId);

          if (records.length === 0) {
            return res.status(404).json({
              status: "failure",
              message: "No mission found",
              data: records,
            });
          } else {
            return res.status(200).json({
              status: "success",
              message: "mission retrieved",
              data: records,
            });
          }
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

      //delete a STM record
      if (req.method === "DELETE") {
        try {
          const reference = await deleteMission(intMissionId);

          return res.status(200).json({
            status: "success",
            message: "Mission Deleted",
            data: reference,
          });
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
}

/**
 * get mission(s) from the database
 * @param missionId the mission id. null will return all missions
 * @returns array of missions
 */
export async function getMissions(missionId: number = null): Promise<Mission[]> {
  await Mikro.getORM();
  const em = Mikro.getEM();

  const missions: Mission[] = missionId
    ? await em.find(Mission_db, { id: missionId })
    : await em.find(Mission_db, {}, { orderBy: [{ name: QueryOrder.ASC }] });

  await Mikro.closeORM();
  return missions;
}

/**
 * Inserts or Updates a mission into the database
 * @param mission the mission object to upsert
 * @returns a copy of the mission object that was upserted
 */
export async function upsertMission(mission: Mission): Promise<Mission> {
  await Mikro.getORM();
  const em = Mikro.getEM();
  let upsertReference;

  if (mission.id) {
    //update record
    mission.version++;
    mission.updatedAt = new Date();
    upsertReference = await em.upsert(Mission_db, mission);
  } else {
    //insert record.
    //Can't use "upsert" to insert a new record if there's no other unique column in the table
    mission.version = 1;
    mission.createdAt = new Date();
    mission.updatedAt = new Date();
    upsertReference = em.create(Mission_db, mission);
  }

  await em.persistAndFlush(upsertReference);
  await Mikro.closeORM();

  return upsertReference as Mission;
}

/**
 * Deletes a single mission
 * @param missionId mission ID to delete
 */
export async function deleteMission(missionId: number): Promise<Mission_db> {
  await Mikro.getORM();
  const em = Mikro.getEM();
  const recordReference = em.getReference(Mission_db, missionId);
  await em.removeAndFlush(recordReference);
  await Mikro.closeORM();
  return recordReference;
}

export default withIronSessionApiRoute(Mikro.withORM(handleMission), ironOptions);
