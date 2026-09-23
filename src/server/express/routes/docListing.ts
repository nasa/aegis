import type { Request, Response } from "express";
import express from "express";
import type { Query } from "express-serve-static-core";
import {
  apiHasPerms,
  apiHasSuperUserOrToken,
  logUsername,
  missionIdsAtLevel,
} from "utils/permissionsServer";
import { Doc_Listing_db } from "server/database/models/_allModels";
import { globalValues } from "../global";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

/**
 * Endpoint for working with the document listings for automerge
 */

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

// get
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const seesEverything = apiHasSuperUserOrToken(req.currentUser);
  const viewableMissions = missionIdsAtLevel(req.currentUser, "viewer");

  const viewPermission = queryObj.missionId
    ? apiHasPerms({
        missionId: queryObj.missionId,
        requiredPermLevel: "viewer",
        user: req.currentUser,
      })
    : // no mission was specified, so check they can view at least one
      seesEverything || viewableMissions.length > 0;
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "automerge",
      appUsername: logUsername(req.currentUser),
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    let records: AutomergeDocListing[];
    if (queryObj.missionId) {
      records = await getAutomergeDocListing([queryObj.missionId]);
    } else {
      // A super user holds no grant rows, so null here means every mission.
      records = await getAutomergeDocListing(seesEverything ? null : viewableMissions);
    }
    res.status(200).json({
      status: "success",
      message: "automerge doc listings retrieved",
      data: records,
    });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "automerge",
      appUsername: logUsername(req.currentUser),
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

export default router;

/**
 * get automerge document listing from the database
 * @returns automerge document listing
 * @param missionIds mission IDs to get, null for all
 */
export async function getAutomergeDocListing(
  missionIds: number[] = null
): Promise<AutomergeDocListing[]> {
  // must manually fork because sometimes this call is outside normal http request context (what we do in routes)
  const em = globalValues.orm.em.fork();
  let automergeListing: Doc_Listing_db[];
  if (!missionIds) {
    automergeListing = await em.find(Doc_Listing_db, {});
  } else {
    automergeListing = await em.find(Doc_Listing_db, { missionId: missionIds });
  }

  return automergeListing;
}
