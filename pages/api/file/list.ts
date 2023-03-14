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
    const { path } = req.query as { [key: string]: string };

    if (req.session.user) {
      const listing: GISfile[] = await listFiles(decodeURIComponent(path));
      res.status(200).json({ data: listing });
    } else {
      res.status(401).json("Unauthorized");
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
}
