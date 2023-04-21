import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

type FlaskServiceResponse = {
  key: string;
  result_url: string;
  status: string;
};

type FlaskJobResponse = {
  end_type: number;
  error: string;
  key: string;
  process_time: number;
  report: string;
  returncode: number;
  start_time: string;
};

const getPolylineProfile: NextApiHandler<WrappedResponse<number[][]>> = async (
  req,
  res
): Promise<unknown> => {
  try {
    if (req.session?.user) {
      if (req.method === "POST") {
        const postData: ElevationProfilePostData = req.body;

        // The "/static" path is mapped in the docker-compose file for the GDAL container. This maps to the public static folder in the project.
        const geoTiffPath = `/static/missionFiles/${postData.missionId}/${postData.demFilepath}`;

        // console.log("geoTiffPath: " + geoTiffPath);

        let initRes: Response = null;
        let initJobRes: FlaskServiceResponse = null;
        try {
          // convert negative signs to underscores for passing as pipe-delimited python parameter
          const pathParam = postData.path
            .map((point) => {
              const latConv = point.lat.toString().replace("-", "_");
              const lngConv = point.lng.toString().replace("-", "_");
              return `${latConv},${lngConv}`;
            })
            .join("|");

          // convert to pipe-delimited python parameter
          const stepsParam = postData.pathSegmentDistances
            .map((dist) => Math.ceil(dist / postData.resolutionMeters).toString())
            .join("|");

          const pythonArgs = {
            args: [
              "--raster",
              geoTiffPath,
              "--axes",
              "z",
              "--band",
              "1",
              "--path",
              pathParam,
              "--steps",
              stepsParam,
            ],
          };

          initRes = await fetch(
            `http://${process.env.GDAL_HOST}:${process.env.GDAL_PORT}/commands/pathToElevationProfile`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(pythonArgs),
            }
          );

          initJobRes = await initRes.json();
          // console.log("initJobRes: " + JSON.stringify(initJobRes));
        } catch (e) {
          console.error("Posting error", e);
          return res.status(500).json({
            status: "error",
            message:
              "Error POSTing the job to docker. " + e + " | Response: " + JSON.stringify(initRes),
          });
        }

        try {
          // call the docker container with python to get the results

          const jobRes = await fetch(
            `http://${process.env.GDAL_HOST}:${process.env.GDAL_PORT}/commands/pathToElevationProfile?key=${initJobRes?.key}&wait=true`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          const jobResJson: FlaskJobResponse = await jobRes.json();
          // console.log("jobResJson: " + JSON.stringify(jobResJson));

          const elevationResults: number[][] = JSON.parse(jobResJson.report);

          return res.status(200).json({
            status: "success",
            message: "elevation profile retrieved in " + jobResJson.process_time + " seconds",
            data: elevationResults,
          });
        } catch (e) {
          console.error("Error GETing the result from docker", e);
          return res.status(500).json({
            status: "error",
            message:
              "Error GETing the result from docker. " +
              e +
              " | Response: " +
              JSON.stringify(initRes),
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
