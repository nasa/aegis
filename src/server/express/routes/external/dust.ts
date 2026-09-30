import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import { getAutomergeMissions } from "../missionAutomerge";
import type { FeatureCollection, LineString, Feature } from "geojson";

type DustDataEva = {
  evaName: string;
  rexUuid: string; // null if this is an as-planned eva
  rexName: string; // null if this is an as-planned eva
  fullTraverse: FeatureCollection<LineString>;
};

type DustData = {
  missionId: number;
  name: string; // mission name
  traversesGeoJson: {
    [evaUuid: string]: DustDataEva;
  };
};

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

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
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "external/dust",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  //check for required mission id is valid
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "GET",
      responseStatus: 400,
      routeName: "external/dust",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Invalid mission ID",
    });
    res.status(400).json({ status: "error", message: "Invalid mission ID" });
    return;
  }

  try {
    const data = await getDustData(queryObj.missionId);
    res.status(200).json({ status: "success", message: "data successfully retrieved", data });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "external/dust",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error getting dust data ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting dust data ${e}` });
  }
});

export async function getDustData(missionId: number): Promise<DustData> {
  const mission = (await getAutomergeMissions([missionId]))[0];

  if (!mission) {
    throw new Error(`Mission ${missionId} not found`);
  }

  const dustData: DustData = {
    missionId: mission.id,
    name: mission.name,
    traversesGeoJson: {},
  };

  for (const eva of Object.values(mission.evas ?? {})) {
    const rex = Object.values(mission.rexes ?? {}).find((r) => r.evaUuid === eva.uuid);
    const dustDataEva: DustDataEva = {
      evaName: eva.name,
      rexUuid: rex?.uuid ?? null,
      rexName: rex?.name ?? null,
      fullTraverse: { type: "FeatureCollection", features: [] },
    };

    if (!eva.name && rex) {
      // Get name from as-planned EVA
      const allRexEvaUuids = Object.values(mission.rexes ?? {}).map((r) => r.evaUuid);
      const asPlannedEva = Object.values(mission.evas ?? {}).find(
        (e) => e.refUuid === eva.refUuid && !allRexEvaUuids.includes(e.uuid)
      );
      dustDataEva.evaName = asPlannedEva?.name || "";
    }

    // Build one full path of the EVA traverses
    const traverseUuids = eva.sequence
      .filter((sequence) => sequence.type === "traverse")
      .map((sequence) => sequence.uuid);

    const fullPathCoords: number[][] = [];
    for (const traverseUuid of traverseUuids) {
      const traverse = mission.traverses?.[traverseUuid];
      if (!traverse) continue;
      for (const pathItem of traverse.path) {
        // Push the coordinate if it's not the same as the last one
        if (
          fullPathCoords.length === 0 ||
          fullPathCoords[fullPathCoords.length - 1][0] !== pathItem.lng ||
          fullPathCoords[fullPathCoords.length - 1][1] !== pathItem.lat
        )
          fullPathCoords.push([pathItem.lng, pathItem.lat]);
      }
    }

    const featureCollection: FeatureCollection<LineString> & { start_datetime?: string } = {
      type: "FeatureCollection",
      start_datetime: eva?.datetime != null ? new Date(eva.datetime).toISOString() : undefined,
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: fullPathCoords },
          properties: { name: `Traverse for EVA: ${dustDataEva.evaName}` },
        } as Feature<LineString>,
      ],
    };
    dustDataEva.fullTraverse = featureCollection;

    dustData.traversesGeoJson[eva.uuid] = dustDataEva;
  }

  return dustData;
}

export default router;
