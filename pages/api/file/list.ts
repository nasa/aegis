import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { listFiles } from "server/file/file";
import { withIronSessionApiRoute } from "iron-session/next";

import { ironOptions } from "server/session/config";
/**
 * `/api/file/list`
 *
 * list files
 */

const handler: NextApiHandler<WrappedResponse<GISfile[]>> = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<unknown> => {
  try {
    const { path } = req.query as { [key: string]: string };

    if (!req.session.user) {
      res.status(401).json("Unauthorized");
      return;
    }
    const listing: GISfile[] = await listFiles(decodeURIComponent(path));
    res.status(200).json({ data: listing });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
};

export default withIronSessionApiRoute(handler, ironOptions);
