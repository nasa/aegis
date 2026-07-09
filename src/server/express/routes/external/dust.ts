import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import express from "express";

import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

import { getAutomergeMissions } from "../missionAutomerge";
import type { FeatureCollection, LineString, Feature } from "geojson";

type DustData = {
  missionId: number;
  name: string;
  evas: { [uuid: string]: Eva };
  rexes: { [uuid: string]: Rex };
  traverses: { [uuid: string]: Traverse };
  traversesGeoJson: { [uuid: string]: FeatureCollection<LineString> };
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

  const traversesGeoJson: { [uuid: string]: FeatureCollection<LineString> } = {};

  // Build a map from traverseUuid -> EVA so we can use the EVA's datetime per the export component
  const traverseUuidToEva: { [traverseUuid: string]: Eva } = {};
  for (const eva of Object.values(mission.evas ?? {})) {
    for (const sequenceItem of eva.sequence ?? []) {
      if (sequenceItem.type === "traverse") {
        traverseUuidToEva[sequenceItem.uuid] = eva;
      }
    }
  }

  // Build a GeoJSON FeatureCollection<LineString> for each traverse, mirroring the
  // "Export Full Traverse as GeoJSON" button in eva-right-eva-export.tsx.
  // Each traverse gets its own FeatureCollection with a single LineString feature.
  for (const traverse of Object.values(mission.traverses ?? {})) {
    const coords: number[][] = [];
    for (const pathItem of traverse.path ?? []) {
      if (
        coords.length === 0 ||
        coords[coords.length - 1][0] !== pathItem.lng ||
        coords[coords.length - 1][1] !== pathItem.lat
      ) {
        coords.push([pathItem.lng, pathItem.lat]);
      }
    }

    const eva = traverseUuidToEva[traverse.uuid];
    const startDatetime = eva?.datetime != null ? new Date(eva.datetime).toISOString() : undefined;

    const featureCollection: FeatureCollection<LineString> & { start_datetime?: string } = {
      type: "FeatureCollection",
      ...(startDatetime ? { start_datetime: startDatetime } : {}),
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { name: `Traverse: ${traverse.name}` },
        } as Feature<LineString>,
      ],
    };

    traversesGeoJson[traverse.uuid] = featureCollection;
  }

  return {
    missionId: mission.id,
    name: mission.name,
    evas: mission.evas ?? {},
    rexes: mission.rexes ?? {},
    traverses: mission.traverses ?? {},
    traversesGeoJson,
  };
}

export default router;
