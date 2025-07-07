import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { makeExportEvas } from "utils/export";
import { getAll } from "../all";
import path from "path";
import fs from "fs";
import { getGridFromFile } from "../grid";
import { SCHEMA_DIR } from "utils/consts-server";
import { getEM } from "utils/mikro";
import { Eva_db } from "server/database/models/eva.model";
import { Rex_db } from "server/database/models/rex.model";

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

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    user: req.session.user,
    emssToken,
  });
  if (!viewPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  //check for required mission id is valid
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  if (queryObj.datesOnly) {
    try {
      const em = getEM();
      let partialEvas: Partial<Eva_db>[] = [];

      // all planned/executed evas for this mission
      const evaQuery = em
        .createQueryBuilder(Eva_db)
        .select(["uuid", "refUuid", "createdAt", "updatedAt"])
        .where({ mission: { id: queryObj.missionId } });

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
      console.error(e);
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

      const gridCoordinates: MissionGridPoint[][] = allData.mission.activeGridUuid
        ? await getGridFromFile(queryObj.missionId, allData.mission.activeGridUuid)
        : null;

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
      console.error(e);
      res.status(500).json({ status: "error", message: `Error getting readable evas ${e}` });
      return;
    }
  }

  return;
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "exportEva.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "eva schema retrieved",
      data: schema,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      status: "error",
      message: `Error retrieving schema: ${e}`,
      data: null,
    });
  }
  return;
});

export default router;
