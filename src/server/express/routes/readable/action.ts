import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
import { makeExportActions } from "utils/export";
import { getAll } from "../all";
import path from "path";
import fs from "fs";
import { getGridFromFile } from "../grid";
import { SCHEMA_DIR } from "utils/consts-server";
import { getEM } from "utils/mikro";
import { Action_db, Eva_db, Rex_db } from "server/database/models/_allModels";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, refUuid, evaRefUuid, rexUuid, datesOnly } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    actionRefUuid: refUuid ? (refUuid as string) : undefined,
    evaRefUuid: evaRefUuid ? (evaRefUuid as string) : undefined,
    rexUuid: rexUuid ? (rexUuid as string) : undefined, // if !rexUuid then use the as-planned EVA copy
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
  if (queryObj.datesOnly && !queryObj.actionRefUuid) {
    res.status(400).json({
      status: "error",
      message: "datesOnly query requires action refUuid to be specified",
    });
    return;
  }
  if (queryObj.evaRefUuid && (queryObj.actionRefUuid || queryObj.datesOnly)) {
    res.status(400).json({
      status: "error",
      message: "evaRefUuid cannot be used with action refUuid or datesOnly",
    });
    return;
  }

  if (queryObj.datesOnly) {
    try {
      const em = getEM();
      let actions: Action_db[] = [];
      if (queryObj.rexUuid) {
        // get the rex version of action
        // Get a rex eva sequence
        const evaUuidSubquery = em.createQueryBuilder(Rex_db).select("evaUuid").where({
          uuid: queryObj.rexUuid,
        });
        const evaSequencesQuery = em.createQueryBuilder(Eva_db).select(["sequence"]).where({
          uuid: evaUuidSubquery.getKnexQuery(),
        });
        const evaSequences = await evaSequencesQuery.execute();
        const evaSequenceItemUuids = evaSequences.flatMap((eva) =>
          eva.sequence.map((sequenceItem) => sequenceItem.uuid)
        );
        const actionQuery = em
          .createQueryBuilder(Action_db)
          .select(["uuid", "createdAt", "updatedAt"])
          .where({
            refUuid: queryObj.actionRefUuid,
            $or: [
              { station: { uuid: { $in: evaSequenceItemUuids } } },
              { traverse: { uuid: { $in: evaSequenceItemUuids } } },
            ],
          });
        actions = await actionQuery.execute();
      } else {
        // get as-planned version of action
        // Get all of the as-planned EVA sequences
        const rexEvasSubquery = em.createQueryBuilder(Rex_db).select("evaUuid");
        const evaSequencesQuery = em
          .createQueryBuilder(Eva_db)
          .select(["sequence"])
          .where({
            uuid: { $nin: rexEvasSubquery.getKnexQuery() },
          });
        const evaSequences = await evaSequencesQuery.execute();
        const rexEvaSequenceItemUuids = evaSequences.flatMap((eva) =>
          eva.sequence.map((sequenceItem) => sequenceItem.uuid)
        );
        // get actions that match the refUuid and are not part of a rex eva
        const actionQuery = em
          .createQueryBuilder(Action_db)
          .select(["uuid", "createdAt", "updatedAt"])
          .where({
            refUuid: queryObj.actionRefUuid,
            $or: [
              { station: { uuid: { $nin: rexEvaSequenceItemUuids } } },
              { traverse: { uuid: { $nin: rexEvaSequenceItemUuids } } },
            ],
          });
        actions = await actionQuery.execute();
      }

      // Transform to desired format
      const dateActions = actions.map((action) => ({
        actionUuid: action.uuid,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt,
      }));

      res.status(200).json({
        status: "success",
        message: `action dates retrieved`,
        data: dateActions,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ status: "error", message: `Error getting actions ${e}` });
    }
  } else {
    try {
      // Standard flow for full objects
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

      let actions: Action[] = [];

      if (queryObj.actionRefUuid) {
        if (queryObj.rexUuid) {
          // get the rex version of this action
          const rexEvaUuid = allData.rexes.find((r) => r.uuid === queryObj.rexUuid)?.evaUuid;
          const rexEvaSequenceItemUuids = allData.evas
            .find((e) => e.uuid === rexEvaUuid)
            ?.sequence?.map((sequenceItem) => sequenceItem.uuid);
          actions = allData.actions.filter(
            (action) =>
              action.refUuid === queryObj.actionRefUuid &&
              (rexEvaSequenceItemUuids?.includes(action.stationUuid) ||
                rexEvaSequenceItemUuids?.includes(action.traverseUuid))
          );
        } else {
          // get the as-planned version of this action
          const allRexEvas = allData.rexes.map((r) => r.evaUuid);
          const asPlannedEvasSequenceItemUuids = allData.evas
            .filter((e) => !allRexEvas.includes(e.uuid))
            .flatMap((e) => e.sequence.map((sequenceItem) => sequenceItem.uuid));
          actions = allData.actions.filter(
            (action) =>
              action.refUuid === queryObj.actionRefUuid &&
              (asPlannedEvasSequenceItemUuids.includes(action.stationUuid) ||
                asPlannedEvasSequenceItemUuids.includes(action.traverseUuid))
          );
        }
      } else if (queryObj.evaRefUuid) {
        if (queryObj.rexUuid) {
          // get the rex version of this eva
          // technically we don't even need to check the evaRefUuid here, since we have a rexUuid
          const rexEvaUuid = allData.rexes.find((r) => r.uuid === queryObj.rexUuid)?.evaUuid;
          const rexEvaSequenceItemUuids = allData.evas
            .find((e) => e.uuid === rexEvaUuid)
            ?.sequence?.map((sequenceItem) => sequenceItem.uuid);
          actions = allData.actions.filter(
            (action) =>
              rexEvaSequenceItemUuids?.includes(action.stationUuid) ||
              rexEvaSequenceItemUuids?.includes(action.traverseUuid)
          );
        } else {
          // get the as-planned copy of this eva
          const allRexEvas = allData.rexes.map((r) => r.evaUuid);
          const asPlannedEva = allData.evas.find(
            (e) => e.refUuid === queryObj.evaRefUuid && !allRexEvas.includes(e.uuid)
          );
          if (asPlannedEva) {
            const evaSequenceItemUuids = asPlannedEva.sequence?.map(
              (sequenceItem) => sequenceItem.uuid
            );
            actions = allData.actions.filter(
              (action) =>
                evaSequenceItemUuids.includes(action.stationUuid) ||
                evaSequenceItemUuids.includes(action.traverseUuid)
            );
          }
        }
      }

      const gridCoordinates: MissionGridPoint[][] = allData.mission.activeGridUuid
        ? await getGridFromFile(queryObj.missionId, allData.mission.activeGridUuid)
        : null;

      const exportActions: ExportAction[] = makeExportActions({
        actions: actions,
        missionGrid: gridCoordinates,
        allData,
      });

      res.status(200).json({
        status: "success",
        message: "readable actions retrieved",
        data: exportActions,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ status: "error", message: `Error getting readable actions ${e}` });
    }
  }
});

router.get("/schema", async (req: Request, res: Response): Promise<void> => {
  try {
    const schemaFile = fs.readFileSync(path.join(SCHEMA_DIR, "exportAction.json"), "utf8");
    const schema = JSON.parse(schemaFile);
    res.status(200).json({
      status: "success",
      message: "action schema retrieved",
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
