import _ from "lodash";
import type { NextApiHandler } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

const handleLastEditEvent: NextApiHandler<WrappedResponse<EditEvent>> = async (
  req,
  res
): Promise<unknown> => {
  //check logged in
  if (!req.session?.user) {
    return res.status(401).json({ status: "failure", message: "Unauthorized" });
  }

  const { missionId } = req.query;
  const intMissionId = parseInt(missionId as string);

  // return global value for last socket event
  if (req.method === "GET") {
    if (!intMissionId || _.isNaN(intMissionId)) {
      return res.status(500).json({ status: "error", message: "Invalid mission ID" });
    }

    const lastEditEvent = global.__serverSocketStatus__?.lastEditEvents[intMissionId] || null;

    return res.status(200).json({
      status: "success",
      message: "last edit event retrieved",
      data: lastEditEvent,
    });
  }
};

export default withIronSessionApiRoute(handleLastEditEvent, ironOptions);
