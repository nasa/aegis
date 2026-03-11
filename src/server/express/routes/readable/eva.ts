import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { Eva_db } from "server/database/models/eva.model";
import { Rex_db } from "server/database/models/rex.model";
import { makeExportEvas } from "utils/export";
import { hasPerms } from "utils/permissions";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { globalValues } from "../../global";

import { getAll } from "../all";
import { getGrids } from "../grid";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, refUuid, rexUuid, datesOnly } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    evaRefUuid: refUuid ? (refUuid as string) : undefined,
    rexUuid: rexUuid ? (rexUuid as string) : undefined, // if !rexUuid then use the as-planned EVA copy
    datesOnly: datesOnly === "true",
  };
  return queryObj;
};

/**
 * If users provide a rexUuid than it will take precedence over evaRefUuid.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
    emssToken,
  });
  if (!viewPermission) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "readable/eva",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  //check for required mission id is valid
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    apiRouteLogger({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "readable/eva",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  if (queryObj.datesOnly) {
    try {
      const em = globalValues.orm.em;
      let partialEvas: Partial<Eva_db>[] = [];

      // all planned/executed evas for this mission
      const evaQuery = em
        .createQueryBuilder(Eva_db)
        .select(["uuid", "refUuid", "createdAt", "updatedAt"])
        .where({ missionId: queryObj.missionId });

      if (queryObj.rexUuid) {
        // get a specific eva from a rex
        const evaUuidSubquery = em.createQueryBuilder(Rex_db).select("evaUuid").where({
          uuid: queryObj.rexUuid,
        });
        evaQuery.andWhere({
          uuid: evaUuidSubquery.getKnexQuery(),
        });
      } else if (queryObj.evaRefUuid) {
        // get the as-planned copy of this eva. The as-planned eva is one that has the same refUuid, but is not a rex eva
        const allRexEvas = em.createQueryBuilder(Rex_db).select("evaUuid");
        evaQuery.andWhere({
          refUuid: queryObj.evaRefUuid,
          uuid: { $nin: allRexEvas.getKnexQuery() },
        });
      } else {
        // get all as-planned evas for this mission
        const allRexEvas = em.createQueryBuilder(Rex_db).select("evaUuid");
        evaQuery.andWhere({
          uuid: { $nin: allRexEvas.getKnexQuery() },
        });
      }

      partialEvas = await evaQuery.execute();

      res.status(200).json({
        status: "success",
        message: `eva dates retrieved`,
        data: partialEvas,
      });
    } catch (e) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "GET",
        responseStatus: 500,
        routeName: "readable/eva",
        appUsername: req.session?.appUser?.username,
        missionId: queryObj.missionId,
        message: `Error getting evas ${e}`,
        error: asError(e),
      });
      res.status(500).json({ status: "error", message: `Error getting evas ${e}` });
      return;
    }
  } else {
    try {
      const wholeStore: OneMissionToRuleThemAll = await getAll(queryObj.missionId);
      const allData: AllDataForExport = {
        mission: wholeStore.mission,
        pois: wholeStore.pois,
        stations: wholeStore.stations,
        actions: wholeStore.actions,
        traverses: wholeStore.traverses,
        evas: wholeStore.evas,
        rexes: wholeStore.rexes,
        level1s: wholeStore.level1s,
        level2s: wholeStore.level2s,
        level3s: wholeStore.level3s,
      };

      let evas: Eva[] = [];

      if (queryObj.rexUuid) {
        // specific eva from a rex
        const rexEva = allData.rexes.find((r) => r.uuid === queryObj.rexUuid);
        if (rexEva) {
          const eva = allData.evas.find((eva) => eva.uuid === rexEva.evaUuid);
          if (eva) evas = [eva];
        }
      } else if (queryObj.evaRefUuid) {
        // get the as-planned copy of this eva. The as-planned eva is one that has the same refUuid, but is not a rex eva
        // if they had provided a rexUuid, it would have been caught in the previous if statement
        const allRexEvas = allData.rexes.map((r) => r.evaUuid);
        const asPlannedEva = allData.evas.find(
          (e) => e.refUuid === queryObj.evaRefUuid && !allRexEvas.includes(e.uuid)
        );
        if (asPlannedEva) evas = [asPlannedEva];
      } else {
        // all as-planned evas for this mission
        const allRexEvas = allData.rexes.map((r) => r.evaUuid);
        const asPlannedEvas = allData.evas.filter((e) => !allRexEvas.includes(e.uuid));
        evas = asPlannedEvas;
      }

      let gridCoordinates = null;
      if (allData.mission.activeGridUuid) {
        try {
          gridCoordinates = (
            await getGrids(queryObj.missionId, true, allData.mission.activeGridUuid)
          )[0]?.coordinates;
        } catch (e) {
          // something went wrong with fetching grids. Report an error but continue without grid data
          apiRouteLogger({
            logLevel: "error",
            httpMethod: "GET",
            responseStatus: null,
            routeName: "readable/eva",
            appUsername: req.session?.appUser?.username,
            missionId: queryObj.missionId,
            message: `Error getGridFromFile: ${e}`,
            error: asError(e),
          });
        }
      }

      const exportEvas: ExportEva[] = makeExportEvas({
        evas: evas,
        allData: allData,
        missionGrid: gridCoordinates,
      });

      res.status(200).json({
        status: "success",
        message: "readable evas retrieved",
        data: exportEvas,
      });
      return;
    } catch (e) {
      apiRouteLogger({
        logLevel: "error",
        httpMethod: "GET",
        responseStatus: 500,
        routeName: "readable/eva",
        appUsername: req.session?.appUser?.username,
        missionId: queryObj.missionId,
        message: `Error getting readable evas ${e}`,
        error: asError(e),
      });
      res.status(500).json({ status: "error", message: `Error getting readable evas ${e}` });
      return;
    }
  }

  return;
});

export default router;
