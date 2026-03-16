import { asError } from "@emss/utils";
import type { Request, Response, Router } from "express";
import express from "express";
import { apiRouteLogger } from "utils/logging/serverLogger";

const router: Router = express.Router();

router.get("/", (req: Request, res: Response) => {
  try {
    const currentTime = new Date().toISOString();
    res.json({ time: currentTime });
  } catch (error) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "time",
      appUsername: req.session?.appUser?.username,
      message: "Failed to get server time",
      error: asError(error),
    });
    res.status(500).json({ error: "Failed to get server time" });
  }
});

export default router;
