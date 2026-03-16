import { asError } from "@emss/utils";
import type { Request, Response } from "express";
import express from "express";
import { globalValues } from "server/express/global";
import { apiRouteLogger } from "utils/logging/serverLogger";
const router = express.Router();

// only super admin can get and set this value
router.get("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.session?.appUser?.isSuperAdmin) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "emss/enableEmssApi",
      appUsername: req.session?.appUser?.username,
      message: "Unauthorized access attempt",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const isEmssApiEnabled = globalValues.isEmssApiEnabled;
    res.status(200).json({
      status: "success",
      message: `isEmssApiEnabled retrieved`,
      data: isEmssApiEnabled,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "emss/enableEmssApi",
      appUsername: req.session?.appUser?.username,
      message: "Error getting endpoint",
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error getting endpoint ${e}` });
  }
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.session?.appUser?.isSuperAdmin) {
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "emss/enableEmssApi",
      appUsername: req.session?.appUser?.username,
      message: "Unauthorized access attempt",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }

  try {
    const { enable } = req.body;
    if (typeof enable !== "boolean") {
      apiRouteLogger({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "emss/enableEmssApi",
        appUsername: req.session?.appUser?.username,
        message: "enable must be a boolean",
      });
      res.status(400).json({ status: "failure", message: "enable must be a boolean" });
      return;
    }
    globalValues.isEmssApiEnabled = enable;
    res.status(200).json({
      status: "success",
      message: `isEmssApiEnabled set to ${enable}`,
      data: globalValues.isEmssApiEnabled,
    });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "emss/enableEmssApi",
      appUsername: req.session?.appUser?.username,
      message: "Error setting endpoint",
      error: asError(e),
    });
    res.status(500).json({ status: "error", message: `Error setting endpoint ${e}` });
  }
});

export default router;
