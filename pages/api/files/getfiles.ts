import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { Op } from "sequelize";

import { ironOptions } from "server/session/config";
import { Userfiles } from "server/db/Draw/models/userfiles";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    if (req.session.user) {
      const files = await getFiles(req.session.user.username);
      res.status(200).json(files);
    } else {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to retrieve files." });
  }
}

async function getFiles(username: string) {
  let files;

  files = await Userfiles.findAll({
    where: {
      //file_owner is req.user or public is '0'
      hidden: "0",
      [Op.or]: {
        file_owner: username,
        public: "1",
      },
    },
  });

  return {
    status: "success",
    message: "Successfully got files.",
    body: files,
  };
}
