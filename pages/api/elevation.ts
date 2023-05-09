import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

const getPolylineProfile: NextApiHandler<WrappedResponse<number[][]>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    if (req.session?.user) {
      if (req.method === "POST") {
        const postData: ElevationProfilePostData = req.body;

        // The "/static" path is mapped in the docker-compose file for the GDAL container. This maps to the public static folder in the project.
        const rasterFilePath = `/static/missionFiles/${postData.missionId}/${postData.demFilepath}`;

        let initRes: Response = null;
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
            initResJson.data = initResJson.data.map((segment) =>
              segment.map((elevation) => parseFloat(String(elevation)))
            );
          } catch (e) {
            console.error("Error parsing initResJson", e);
            return res.status(500).json({
              status: "error",
              message:
                "Error parsing initResJson. " + e + " | Response: " + JSON.stringify(initRes),
            });
          }

          if (initResJson.status === "success") {
            return res.status(200).json({
              status: "success",
              data: initResJson.data,
              message: "Success POSTing the job to docker.",
            });
          } else {
            return res.status(500).json({
              status: "error",
              message: "Error POSTing the job to docker. Error: " + initResJson.message,
            });
          }
        } catch (e) {
          console.error("Posting error", e);
          return res.status(500).json({
            status: "error",
            message:
              "Error POSTing the job to docker. " + e + " | Response: " + JSON.stringify(initRes),
          });
        }
      }
    } else {
      return res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (e) {
    console.error("Error in query", e);
    return res
      .status(500)
      .json({ status: "error", message: "Error in query " + JSON.stringify(e) });
  }
};

export default withIronSessionApiRoute(getPolylineProfile, ironOptions);
