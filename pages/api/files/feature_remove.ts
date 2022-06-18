import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import Sequelize from "sequelize";
import { uuid } from "uuidv4";

import { ironOptions } from "server/session/config";
import { Userfiles } from "server/db/Draw/models/userfiles";
import { Userfeatures } from "server/db/Draw/models/userfeatures";
import { Filehistories } from "server/db/Draw/models/filehistories";
import { pushToHistory } from "server/api_utils/files";

import { getSequelizeConnection } from "server/db/connection";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    if (req.session.user) {
      const files = await removeFeature(req);
      res.status(200).json(files);
    } else {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to remove feature." + error });
  }
}

/**
 * Hides a feature
 * {
 * 	file_id: <number> (required)
 *  feature_id: <number> (required)
 * }
 */
async function removeFeature(req: any) {
  let time = Math.floor(Date.now());

  let groups = [];
  if (req.groups) groups = Object.keys(req.groups);

  const userFile = await Userfiles.findOne({
    where: {
      id: req.body.file_id,
      [Sequelize.Op.or]: {
        file_owner: req.user,
        [Sequelize.Op.and]: {
          file_owner: "group",
          file_owner_group: { [Sequelize.Op.overlap]: groups },
        },
      },
    },
  });

  if (!userFile) {
    return {
      status: "failure",
      message: "Failed to access file.",
      body: {},
    };
  }

  const updateResult = await Userfeatures.update(
    {
      extant_end: time,
    },
    {
      where: {
        file_id: req.body.file_id,
        id: req.body.id,
      },
    }
  );

  //Table, file_id, feature_id, feature_idRemove, time, undoToTime, action_index
  pushToHistory(
    Filehistories,
    req.body.file_id,
    null,
    req.body.id,
    time,
    null,
    2,
    () => {
      return {
        status: "success",
        message: "Feature removed.",
        body: {},
      };
    },
    (err) => {
      return {
        status: "failure",
        message: "Failed to remove feature.",
        body: {},
      };
    }
  );
}
