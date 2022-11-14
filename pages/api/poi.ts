import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";
import Mikro from "utils/mikro";
import { Poi } from "server/database/models/poi.model";
import { QueryOrder } from "@mikro-orm/core";
import { roundDateToSecond } from "utils/formatting";

export const handlePOI: NextApiHandler<WrappedResponse<POI[] | POI>> = async (
  req,
  res
): Promise<unknown> => {
  // If method is GET and there is a missionId query parameter, then get POIs by mission ID
  if (req.method === "GET" && req.query.missionId) {
    const {
      query: { missionId },
    } = req;
    const intMissionId = parseInt(Array.isArray(missionId) ? missionId[0] : missionId);
    if (typeof intMissionId !== "number") {
      return res.status(500).json({ status: "error", message: "Mission ID must be integer." });
    }
    try {
      if (req.session?.user) {
        const pois = await getPOIsByMission(intMissionId);
        return res.status(200).json({
          status: "success",
          message: "POIs retrieved",
          data: pois,
        });
      } else {
        return res.status(401).json({ status: "failure", message: "Unauthorized" });
      }
    } catch (error) {
      return res.status(500).json({ status: "error", message: "Failed to get POIs." });
    }
  }

  // If method is POST then upsert a POI
  if (req.method === "POST") {
    const poiBody = req.body as POI;
    if (req.session?.user) {
      try {
        await Mikro.getORM();
        const em = await Mikro.getEM();
        const poiToUpsert = {
          ...poiBody,
          createdAt: poiBody.createdAt || roundDateToSecond(new Date()),
          updatedAt: roundDateToSecond(new Date()),
        };
        const upsertResult = await em.upsert(Poi, poiToUpsert);
        await em.persistAndFlush(upsertResult);
        await Mikro.closeORM();
        const responsePoi: POI = {
          ...upsertResult,
          mission: upsertResult.mission.id,
          owner: upsertResult.owner.id,
        };

        return res.status(200).json({
          status: "success",
          message: "POI upserted",
          data: responsePoi,
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to upsert POI: " + error });
      }
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  }

  // If method is DELETE then delete a POI
  if (req.method === "DELETE") {
    const {
      query: { uuid },
    } = req;
    if (req.session?.user) {
      try {
        await Mikro.getORM();
        const em = await Mikro.getEM();
        const poiToDelete = await em.findOne(Poi, { uuid });
        await em.removeAndFlush(poiToDelete);
        await Mikro.closeORM();
        return res.status(200).json({
          status: "success",
          message: "POI deleted",
        });
      } catch (error) {
        return res.status(500).json({ status: "error", message: "Failed to delete POI." });
      }
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  }
};

export default withIronSessionApiRoute(Mikro.withORM(handlePOI), ironOptions);

export async function getPOIsByMission(missionId: number): Promise<POI[]> {
  await Mikro.getORM();
  const em = await Mikro.getEM();
  const pois = await em.find(Poi, { mission: missionId }, { orderBy: { id: QueryOrder.ASC } });

  // transform the Mikro Poi objects into POI objects used in the Store
  const storePOIs: POI[] = pois.map((poi) => {
    return { ...poi, owner: poi.owner.id, mission: poi.mission.id };
  });

  return storePOIs;
}
