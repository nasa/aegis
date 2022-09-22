import { NextApiRequest, NextApiResponse } from "next";
import { deleteFile } from "server/file/file";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

/**
 * `/api/file/delete?name=`
 *
 * delete file or folder recursively
 */
export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { name } = req.query as { [key: string]: string };
  try {
    if (req.session.user) {
      const success = await deleteFile(name);
      if (!success) {
        throw new Error("Unable to delete file. Check server log");
      }
      res.status(200).json("Success");
    } else {
      res.status(401).json("Unauthorized");
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
}
