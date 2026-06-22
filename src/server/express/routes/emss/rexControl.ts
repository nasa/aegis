import type { Request, Response } from "express";
import express from "express";

import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { v4 as uuidv4 } from "uuid";
import { getAutomergeMissions, getAutomergeMissionHandle } from "../missionAutomerge";

// NOT USED BY MAESTRO - Only used by our AEGIS admin page

const router = express.Router();
interface RexControlUpdateRequest {
  rexUuid: string;
  maestroControlled?: boolean;
  startStopExecution?: "start" | "stop";
  maestroEventId?: string;
  maestroEventUrl?: string;
  maestroActivityProperties?: MaestroActivityPropertiesByRefUuid | null;
}

// POST request to update REX control settings
// Note: When starting execution, all other running REX items are automatically stopped
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const {
    rexUuid,
    maestroControlled,
    startStopExecution,
    maestroEventId,
    maestroEventUrl,
    maestroActivityProperties,
  } = req.body as RexControlUpdateRequest;
  const emssToken = req.headers["emss-token"] as string;

  // Check if user has EMSS permissions or super admin for the backend emss admin page
  const editPermission = hasPerms({
    missionId: null,
    permission: null,
    appUser: req.session?.appUser,
    emssToken: emssToken,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "emss/rexControl",
      appUsername: req.session?.appUser?.username,
      uuids: [rexUuid],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  // validate inputs
  if (!rexUuid) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "emss/rexControl",
      appUsername: req.session?.appUser?.username,
      uuids: [rexUuid],
      message: "Missing required body parameter: rexUuid",
    });
    res.status(400).json({
      status: "failure",
      message: "Missing required body parameter: rexUuid",
    });
    return;
  }
  // Check that at least one optional parameter is provided
  if (
    maestroControlled === undefined &&
    startStopExecution === undefined &&
    maestroEventId === undefined &&
    maestroEventUrl === undefined &&
    maestroActivityProperties === undefined
  ) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "emss/rexControl",
      appUsername: req.session?.appUser?.username,
      uuids: [rexUuid],
      message:
        "At least one of maestroControlled, startStopExecution, maestroEventId, maestroEventUrl, or maestroActivityProperties must be provided",
    });
    res.status(400).json({
      status: "failure",
      message:
        "At least one of maestroControlled, startStopExecution, maestroEventId, maestroEventUrl, or maestroActivityProperties must be provided",
    });
    return;
  }
  // Validate startStopExecution if provided
  if (startStopExecution !== undefined && !["start", "stop"].includes(startStopExecution)) {
    serverLogger.apiRoute({
      logLevel: "notice",
      httpMethod: "POST",
      responseStatus: 400,
      routeName: "emss/rexControl",
      appUsername: req.session?.appUser?.username,
      uuids: [rexUuid],
      message: "startStopExecution must be 'start' or 'stop' if provided",
    });
    res.status(400).json({
      status: "failure",
      message: "startStopExecution must be 'start' or 'stop' if provided",
    });
    return;
  }
  // validate maestroEventURL
  if (maestroEventUrl) {
    try {
      const parsedUrl = new URL(maestroEventUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
        throw new Error("Invalid protocol. Must be http or https");
    } catch (e) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "emss/rexControl",
        appUsername: req.session?.appUser?.username,
        uuids: [rexUuid],
        message: "Must be a valid URL " + e,
      });
      res.status(400).json({
        status: "failure",
        message: "Must be a valid URL " + e,
      });
      return;
    }
  }
  // validate maestro activity properties
  if (maestroActivityProperties) {
    for (const refUuid in maestroActivityProperties) {
      const activityProperty = maestroActivityProperties[refUuid];
      // validate color is a hex color
      if (activityProperty.color) {
        const hexColorRegex = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6})$/;
        const isValidColor = hexColorRegex.test(activityProperty.color);
        if (!isValidColor) {
          serverLogger.apiRoute({
            logLevel: "notice",
            httpMethod: "POST",
            responseStatus: 400,
            routeName: "emss/rexControl",
            appUsername: req.session?.appUser?.username,
            uuids: [rexUuid],
            message: `Invalid color format in maestroActivityProperties for refUuid ${refUuid}. Must be a hex color.`,
          });
          res.status(400).json({
            status: "failure",
            message: `Invalid color format in maestroActivityProperties for refUuid ${refUuid}. Must be a hex color.`,
          });
          return;
        }
      }
      // validate number
      if (activityProperty.number && activityProperty.number.length > 3) {
        serverLogger.apiRoute({
          logLevel: "notice",
          httpMethod: "POST",
          responseStatus: 400,
          routeName: "emss/rexControl",
          appUsername: req.session?.appUser?.username,
          uuids: [rexUuid],
          message: `Invalid number property in maestroActivityProperties for refUuid ${refUuid}. Must be less than 4 characters.`,
        });
        res.status(400).json({
          status: "failure",
          message: `Invalid number property in maestroActivityProperties for refUuid ${refUuid}. Must be less than 4 characters.`,
        });
        return;
      }
    }
  }

  try {
    const updatedRexes: Rex[] = await updateRexControl({
      rexUuid,
      maestroControlled,
      startStopExecution,
      maestroEventId,
      maestroEventUrl,
      maestroActivityProperties,
    });

    res.status(200).json({
      status: "success",
      message: `Rex control settings updated for rex uuid(s) ${updatedRexes.map((r) => r.uuid).toString()}`,
      data: updatedRexes,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);

    // Check if it's a specific business logic error
    if (errorMessage.includes("not found")) {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 404,
        routeName: "emss/rexControl",
        appUsername: req.session?.appUser?.username,
        uuids: [rexUuid],
        message: errorMessage,
      });
      res.status(404).json({
        status: "failure",
        message: errorMessage,
      });
      return;
    }

    // Generic server error
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "emss/rexControl",
      appUsername: req.session?.appUser?.username,
      uuids: [rexUuid],
      message: `Error processing the POST request: ${errorMessage}`,
      error: asError(e),
    });
    res
      .status(500)
      .json({ status: "error", message: `Error processing the POST request: ${errorMessage}` });
  }
});

/**
 * Updates the control settings for a specific REX item in the automerge mission document.
 * When starting execution (startStopExecution = "start"), all other running REX items will be
 * automatically stopped to ensure only one REX runs at a time.
 */
export async function updateRexControl({
  rexUuid,
  maestroControlled,
  startStopExecution,
  maestroEventId,
  maestroEventUrl,
  maestroActivityProperties,
}: RexControlUpdateRequest): Promise<Rex[]> {
  // Find the mission containing this rex
  const allMissions = await getAutomergeMissions();
  const missionWithRex = allMissions.find((m) => m.rexes?.[rexUuid]);
  if (!missionWithRex) {
    throw new Error(`Rex with uuid ${rexUuid} not found.`);
  }

  // Determine which other rexes need to be stopped before applying changes
  const rexUuidsToStop: string[] = [];
  if (startStopExecution === "start") {
    for (const uuid in missionWithRex.rexes) {
      if (uuid !== rexUuid && missionWithRex.rexes[uuid].isRunning) {
        rexUuidsToStop.push(uuid);
      }
    }
  }

  const missionDocHandle = await getAutomergeMissionHandle(missionWithRex.id);

  missionDocHandle.change((mission: Mission) => {
    const rexEntity = mission.rexes[rexUuid];
    if (!rexEntity) return;

    // Stop all other running rexes – only one can run at a time
    for (const uuid of rexUuidsToStop) {
      if (mission.rexes[uuid]) {
        mission.rexes[uuid].isRunning = false;
        mission.rexes[uuid].updatedAt = Date.now();
      }
    }

    // Generate initial crew position entries if starting with none
    if (
      startStopExecution === "start" &&
      (!rexEntity.posEntries || rexEntity.posEntries.length === 0)
    ) {
      let egressLocation: AEGISPoint | null = null;
      const rexEva = mission.evas?.[rexEntity.evaUuid];
      // Spread location (same as cloning in this case) so we remove the automerge proxy ref
      if (rexEva?.egressLocationUuid === "lander") {
        egressLocation = mission.landerLocation ? { ...mission.landerLocation } : null;
      } else if (rexEva?.egressLocationUuid) {
        const loc = mission.stations?.[rexEva.egressLocationUuid]?.location;
        egressLocation = loc ? { ...loc } : null;
      }

      if (egressLocation) {
        rexEntity.posEntries = [];
        for (const posSource of rexEntity.posSources) {
          const newPosEntry: PosEntry = {
            uuid: uuidv4(),
            location: egressLocation,
            elevation: null,
            petSeconds: 0,
            posTypeUuids: rexEntity.posTypes.map((posType) => posType.uuid),
            posSourceUuid: posSource.uuid,
            createdAt: new Date().getTime(),
            updatedAt: new Date().getTime(),
          };
          rexEntity.posEntries.push(newPosEntry);
        }
      }
    }

    // Apply only the fields that were explicitly provided
    if (maestroControlled !== undefined) rexEntity.maestroControlled = maestroControlled;
    if (maestroEventId !== undefined) {
      rexEntity.maestroEventId = maestroEventId === "" ? null : maestroEventId;
    }
    if (startStopExecution !== undefined) rexEntity.isRunning = startStopExecution === "start";
    if (maestroEventUrl !== undefined) rexEntity.maestroEventUrl = maestroEventUrl;
    if (maestroActivityProperties !== undefined) {
      rexEntity.maestroActivityPropertiesByRefUuid = maestroActivityProperties;
    }
    rexEntity.updatedAt = Date.now();
  });

  // Read the updated rexes back from the doc
  const updatedMission = missionDocHandle.doc();
  const updatedRexes = [
    updatedMission.rexes[rexUuid],
    ...rexUuidsToStop.map((uuid) => updatedMission.rexes[uuid]),
  ].filter(Boolean);

  return updatedRexes;
}

export default router;
