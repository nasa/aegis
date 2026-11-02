import express from "express";
import type { Request, Response } from "express";
import { emssTokenIsValid } from "utils/permissions";
import { getMissionSummaries } from "server/automerge/missionCatalog";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();
router.get("/", async (req: Request, res: Response) => {
  const user = req.session?.appUser;
  const allMissions = user?.isSuperAdmin || emssTokenIsValid(req.headers["emss-token"] as string);
  const missionIds =
    user?.permissionList?.filter((p) => p.permissions.view).map((p) => p.missionId) ?? [];
  if (!allMissions && !missionIds.length) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const data = await getMissionSummaries(allMissions ? undefined : missionIds, true);
    res.json({ status: "success", message: "Mission summaries retrieved", data });
  } catch (error) {
    serverLogger.error(
      { logId: "mission-catalog", logValue: "Could not list mission summaries" },
      asError(error)
    );
    res.status(500).json({ status: "error", message: "Could not list mission summaries" });
  }
});
export default router;
