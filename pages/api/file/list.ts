import { NextApiRequest, NextApiResponse } from "next";
import { listFiles } from "server/file/file";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
/**
 * `/api/file/list`
 *
 * list files
 */
export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.session.user) {
      const listing: GISfile[] = await listFiles();
      res.status(200).json({ data: listing });
    } else {
      res.status(401).json("Unauthorized");
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
}
