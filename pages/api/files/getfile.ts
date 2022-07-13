import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import { Op } from "sequelize";

import { ironOptions } from "server/session/config";
import { Userfiles } from "server/db/Draw/models/userfiles";

import { getMMGISSequelizeConnection } from "server/db/connection";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    if (req.session.user) {
      const files = await getfile(req.session.user.username as string, req.query.fileId as string);
      res.status(200).json(files);
    } else {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to retrieve files." + error });
  }
}

async function getfile(username: string, fileId: any) {
  const sequelize = getMMGISSequelizeConnection();

  let published = false;

  const fileIdNum = JSON.parse(fileId);
  const idArray = typeof fileIdNum !== "number" ? false : true;

  let atThisTime = Math.floor(Date.now());

  const files = await Userfiles.findAll({
    where: {
      id: fileId,
      //file_owner is req.user or public is '1'
      [Op.or]: {
        file_owner: username,
        public: "1",
      },
    },
  });
  const file = files[0];

  const [histories] = await sequelize.query(
    `SELECT history FROM file_histories WHERE ${
      idArray ? "file_id IN (:id)" : "file_id=:id"
    } AND time<=:time ${published ? "AND action_index=4 " : ""}ORDER BY time DESC FETCH first ${
      published ? fileId.length : "1"
    } rows only`,
    {
      replacements: {
        id: fileId,
        time: atThisTime,
      },
    }
  );

  let bestHistory = [];
  for (let i = 0; i < histories.length; i++) {
    bestHistory = bestHistory.concat(histories[i].history);
  }
  let bestHistoryStr = bestHistory.join(",");
  bestHistoryStr = bestHistoryStr || "NULL";

  const [userFeatures] = await sequelize.query(
    `SELECT id, file_id, level, intent, properties, ST_AsGeoJSON(geom) FROM user_features WHERE ${
      idArray ? "file_id IN (:id)" : "file_id=:id"
    } AND id IN (${bestHistoryStr})`,
    {
      replacements: {
        id: fileId,
      },
    }
  );

  let geojson = { type: "FeatureCollection", features: [] };
  for (let i = 0; i < userFeatures.length; i++) {
    let properties = JSON.parse(userFeatures[i].properties);
    let feature = {} as any;
    properties._ = {
      id: userFeatures[i].id,
      file_id: userFeatures[i].file_id,
      level: userFeatures[i].level,
      intent: userFeatures[i].intent,
    };
    feature.type = "Feature";
    feature.properties = properties;
    feature.geometry = JSON.parse(userFeatures[i].st_asgeojson);
    geojson.features.push(feature);
  }

  //Sort features by level
  geojson.features.sort((a, b) =>
    a.properties._.level > b.properties._.level
      ? 1
      : b.properties._.level > a.properties._.level
      ? -1
      : 0
  );

  return {
    status: "success",
    message: "Successfully got file.",
    body: {
      file: file,
      geojson: geojson,
    },
  };
}
