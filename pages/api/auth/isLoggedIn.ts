import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "utils/ironSession";
import { IronSessionData } from "iron-session";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WrappedResponse<IronSessionData>>
) {
  try {
    if (req.session.user) {
      res.status(200).json({
        status: "success",
        message: "Login checked",
        data: { user: req.session.user },
      });
    } else {
      res.status(200).json({ status: "failure", message: "Not Logged in", data: { user: null } });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Unexpected error :" + error });
  }
}
