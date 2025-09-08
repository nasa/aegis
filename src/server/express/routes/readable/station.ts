import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { Eva_db } from "server/database/models/eva.model";
import { Station_db } from "server/database/models/station.model";
import { Rex_db } from "server/database/models/rex.model";
import { makeExportStations } from "utils/export";
import { getEM } from "utils/mikro";
import { hasPerms } from "utils/permissions";

import { getAll } from "../all";
import { getGridFromFile } from "../grid";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, datesOnly } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    datesOnly: datesOnly === "true",
  };
  return queryObj;
};

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const emssToken = req.headers["emss-token"] as string;

  const viewPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "view",
    appUser: req.session.appUser,
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
      let partialStations: Partial<Station_db>[] = [];

      const rexEvaUuidsSubquery = em
        .createQueryBuilder(Rex_db)
        .select("evaUuid")
        .where({ mission: { id: queryObj.missionId } });

      const asPlannedEvaSequencesQuery = em
        .createQueryBuilder(Eva_db)
        .select(["sequence"])
        .where({
          uuid: { $nin: rexEvaUuidsSubquery.getKnexQuery() },
        });
      const asPlannedEvaSequences = await asPlannedEvaSequencesQuery.execute();
      const evaSequenceItemUuids = asPlannedEvaSequences.flatMap((eva) =>
        eva.sequence.map((sequenceItem) => sequenceItem.uuid)
      );

      // get all as-planned stations
      const stationQuery = em
        .createQueryBuilder(Station_db)
        .select(["uuid", "refUuid", "createdAt", "updatedAt"])
        .where({ mission: { id: queryObj.missionId }, uuid: { $in: evaSequenceItemUuids } });

      partialStations = await stationQuery.execute();

      res.status(200).json({
        status: "success",
        message: `station dates retrieved`,
        data: partialStations,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ status: "error", message: `Error getting stations ${e}` });
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

      // get all as-planned stations
      const allRexEvaUuids = allData.rexes.map((r) => r.evaUuid);
      const asPlannedEvasSequenceItemUuids = allData.evas
        .filter((e) => !allRexEvaUuids.includes(e.uuid))
        ?.flatMap((e) => e.sequence.map((seq) => seq.uuid));
      const notRexStationsUuids = allData.stations.filter((s) =>
        asPlannedEvasSequenceItemUuids.includes(s.uuid)
      );
      const stations: Station[] = notRexStationsUuids;

      const gridCoordinates: MissionGridPoint[][] = allData.mission.activeGridUuid
        ? await getGridFromFile(queryObj.missionId, allData.mission.activeGridUuid)
        : null;

      const exportStations: ExportStation[] = makeExportStations({
        stations: stations,
        missionGrid: gridCoordinates,
        allData,
      });

      res.status(200).json({
        status: "success",
        message: "readable stations retrieved",
        data: exportStations,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ status: "error", message: `Error getting readable stations ${e}` });
    }
  }

  return;
});

export default router;
