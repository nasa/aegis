import type { Request, Response } from "express";
import express from "express";
import type { Query } from "express-serve-static-core";
import { hasPerms } from "utils/permissions";
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
  let viewPermission;
  if (queryObj.missionId) {
    viewPermission = hasPerms({
      missionId: queryObj.missionId,
      permission: "view",
      appUser: req.session.appUser,
    });
  } else {
    //no mission was specified. check if they are allowed to view at least one mission
    viewPermission =
      req.session?.appUser?.isSuperAdmin ||
      req.session?.appUser?.permissionList?.find((p) => p.permissions.view)?.permissions.view;
  }
  if (!viewPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "automerge",
      appUsername: req.session?.appUser?.username,
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
      //super admin can see all missions
      if (req.session.appUser.isSuperAdmin) {
        records = await getAutomergeDocListing();
      } else {
        //return all missions that they have permission for
        const viewableMissions: number[] = req.session.appUser.permissionList.map((p) => {
          if (p.permissions.view) return p.missionId;
        });
        records = await getAutomergeDocListing(viewableMissions);
      }
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
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: `Error processing the GET request ${e}`,
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error processing the GET request ${e}` });
  }
});

router.get("/resolve", async (req: Request, res: Response): Promise<void> => {
  const { missionId } = parseQuery(req.query);
  if (!missionId || !hasPerms({ missionId, permission: "view", appUser: req.session.appUser })) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  const [record] = await getAutomergeDocListing([missionId]);
  if (!record?.automergeUrl) {
    res.status(404).json({ status: "failure", message: "Mission document not found" });
    return;
  }
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.status(200).json({
    status: "success",
    message: "mission document resolved",
    data: {
      missionId: record.missionId,
      automergeUrl: record.automergeUrl,
      databaseEpoch: globalValues.databaseEpoch,
    } satisfies MissionResolution,
  });
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
