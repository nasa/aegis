import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import { hasPerms } from "utils/permissions";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
  return queryObj;
};

// post
router.post("/", async (req: Request, res: Response): Promise<void> => {
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
  if (!queryObj.missionId || isNaN(queryObj.missionId)) {
    res.status(500).json({ status: "error", message: "Invalid mission ID" });
    return;
  }
  const postData: ElevationProfilePostData = req.body;

  // The "/static" path is mapped in the docker-compose file for the GDAL container. This maps to the public static folder in the project.
  const rasterFilePath = `/static/missionFiles/${postData.missionId}/${postData.demFilepath}`;

  let initRes: globalThis.Response = null;
  let initResJson: WrappedResponse<number[][]> = null;

  try {
    const path = postData.path;

    // create steps out of distances / dem resolution
    const steps = postData.pathSegmentDistances.map((dist) =>
      Math.ceil(dist / postData.resolutionMeters).toString()
    );

    const requestBody: ElevationGdalRequestBody = {
      rasterFilePath,
      axes: "z",
      band: 1,
      path,
      steps,
    };

    initRes = await fetch(
      `http://${process.env.GDAL_HOST}:${process.env.GDAL_PORT}/pathToElevationProfile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    try {
      initResJson = await initRes.json();
      // convert all elevations to numbers
      initResJson.data = initResJson.data?.map((segment) =>
        segment.map((elevation) => parseFloat(String(elevation)))
      );
    } catch (e) {
      console.error("Error parsing initResJson", e);
      res.status(500).json({
        status: "error",
        message: "Error parsing initResJson. " + e + " | Response: " + JSON.stringify(initRes),
      });
      return;
    }

    if (initResJson.status === "success") {
      res.status(200).json({
        status: "success",
        data: initResJson.data,
        message: "Success POSTing the job to docker.",
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "Error POSTing the job to docker. Error: " + initResJson.message,
      });
    }
  } catch (e) {
    console.error("Posting error", e);
    res.status(500).json({
      status: "error",
      message: "Error POSTing the job to docker. " + e + " | Response: " + JSON.stringify(initRes),
    });
    return;
  }
});

export default router;
