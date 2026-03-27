import type { Request, Response } from "express";
import express from "express";

import { convertRexesTypeDbToStore } from "store/storeUtils/rex";
import { globalValues } from "../../global";

import { Eva_db, Rex_db, Station_db } from "../../../database/models/_allModels";
import { emitStoreUpsert } from "../../sockets";
import { hasPerms } from "utils/permissions";
import { upsertDatabaseRetry } from "utils/database";
import { v4 as uuidv4 } from "uuid";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";
import { getAutomergeMissions } from "../missionAutomerge";

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
    const updatedRexes: Rex[] = await upsertDatabaseRetry(() =>
      updateRexControl({
        rexUuid: rexUuid,
        maestroControlled: maestroControlled,
        startStopExecution: startStopExecution,
        maestroEventId: maestroEventId,
        maestroEventUrl: maestroEventUrl,
        maestroActivityProperties: maestroActivityProperties,
      })
    );

    if (!updatedRexes || updatedRexes.length === 0) {
      serverLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "emss/rexControl",
        appUsername: req.session?.appUser?.username,
        uuids: [rexUuid],
        message: "Failed to update rex after multiple tries due to optimistic locking",
        error: new Error("Failed to update rex after multiple tries due to optimistic locking"),
      });
      res.status(500).json({
        status: "error",
        message: "Failed to update rex after multiple tries due to optimistic locking",
        data: null,
      });
      return;
    }

    emitStoreUpsert({
      missionId: updatedRexes[0].missionId,
      socketId: "maestroApi",
      type: "rex",
      data: updatedRexes,
    } as StoreUpsert);

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
 * Updates the control settings for a specific REX item.
 * When starting execution (startStopExecution = "start"), all other running REX items will be automatically stopped to ensure only one REX runs at a time.
 */
export async function updateRexControl({
  rexUuid,
  maestroControlled,
  startStopExecution,
  maestroEventId,
  maestroEventUrl,
  maestroActivityProperties,
}: RexControlUpdateRequest): Promise<Rex[]> {
  const em = globalValues.orm.em;
  await em.begin(); // start a transaction

  let rexEntity = null;
  let allRunningRexesBeforeUpdate: Rex_db[] = [];
  try {
    // Find and validate the REX entity by its UUID
    rexEntity = await em.findOne(Rex_db, { uuid: rexUuid });
    if (!rexEntity) {
      throw new Error(`Rex with uuid ${rexUuid} not found.`);
    }

    if (startStopExecution === "start") {
      // Check if we need to stop other running rex records
      allRunningRexesBeforeUpdate = await em.find(Rex_db, {
        missionId: rexEntity.missionId,
        isRunning: true,
        uuid: { $ne: rexUuid },
      });

      // Stop all other running REX records - only one can run at a time
      if (allRunningRexesBeforeUpdate.length > 0) {
        for (const runningRex of allRunningRexesBeforeUpdate) {
          runningRex.isRunning = false;
          runningRex.updatedAt = new Date();
          em.persist(runningRex);
        }
      }

      // Check if initial crew positions need to be generated
      if (!rexEntity.posEntries || rexEntity.posEntries.length === 0) {
        // Get egress location
        let egressLocation: AEGISPoint | null = null;
        const rexEva = await em.findOne(Eva_db, { uuid: rexEntity.evaUuid });
        if (rexEva?.egressLocationUuid === "lander") {
          // get lander location from the mission automerge document
          const mission = (await getAutomergeMissions([rexEva.missionId]))[0];
          if (mission?.landerLocation) egressLocation = mission.landerLocation;
        } else {
          const stationRecord = await em.findOne(Station_db, { uuid: rexEva?.egressLocationUuid });
          if (stationRecord?.location) egressLocation = stationRecord.location;
        }

        // Add pos entries for each pos source. Each entry will include all pos types
        if (egressLocation) {
          if (!rexEntity.posEntries) rexEntity.posEntries = [];
          for (const posSource of rexEntity.posSources) {
            const newPosEntry: PosEntry = {
              uuid: uuidv4(),
              location: egressLocation,
              elevation: null,
              petSeconds: 0,
              posTypeUuids: rexEntity.posTypes.map((posType) => posType.uuid),
              posSourceUuid: posSource.uuid,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            rexEntity.posEntries.push(newPosEntry);
          }
        }
      }
    }

    // Update the target REX entity directly - only update fields that are explicitly provided
    if (maestroControlled !== undefined) rexEntity.maestroControlled = maestroControlled;
    if (maestroEventId !== undefined) {
      rexEntity.maestroEventId = maestroEventId === "" ? null : maestroEventId;
    }
    if (startStopExecution !== undefined) rexEntity.isRunning = startStopExecution === "start";
    if (maestroEventUrl !== undefined) rexEntity.maestroEventUrl = maestroEventUrl;
    if (maestroActivityProperties !== undefined)
      rexEntity.maestroActivityPropertiesByRefUuid = maestroActivityProperties;
    rexEntity.updatedAt = new Date();

    em.persist(rexEntity);
    await em.commit(); // commit the transaction. will also flush
  } catch (error) {
    await em.rollback();
    throw error; // re-throw the error to be handled by the caller
  }

  return [
    convertRexesTypeDbToStore([rexEntity])[0],
    ...convertRexesTypeDbToStore(allRunningRexesBeforeUpdate),
  ];
}

export default router;
