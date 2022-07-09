import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import Sequelize from "sequelize";
import { uuid } from "uuidv4";

import { ironOptions } from "server/session/config";
import { Userfiles } from "server/db/Draw/models/userfiles";
import { Userfeatures } from "server/db/Draw/models/userfeatures";
import { Filehistories } from "server/db/Draw/models/filehistories";
import { pushToHistory } from "server/api_utils/files";

export default withIronSessionApiRoute(handler, ironOptions);

async function handler(req: NextApiRequest, res: NextApiResponse<WrappedResponse<Feature>>) {
  try {
    if (req.session.user) {
      const files = await editFeature(req);
      res.status(200).json(files);
    } else {
      res.status(401).json({ status: "failure", message: "Unauthorized" });
    }
  } catch (error) {
    res.status(500).json({ status: "error", message: "Failed to edit feature." + error });
  }
}

/**
 * Edits a feature
 * {
 * 	file_id: <number> (required)
 *  feature_id: <number> (required)
 * 	parent: <number> (optional)
 *  keywords: <string array> (optional)
 *  intent: <string> (optional)
 *  properties: <object> (optional)
 * 	geometry: <geometry> (optional)
 * }
 */

export async function editFeature(req: any): Promise<WrappedResponse<Feature>> {
  let time = Math.floor(Date.now());

  let groups = [];
  if (req.groups) groups = Object.keys(req.groups);

  if (req.body.to_history == null) req.body.to_history = true;

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
      data: { id: -1, uuid: "", intent: "" },
    };
  }
  const userFeature = await Userfeatures.findOne({
    where: {
      id: req.body.feature_id,
      file_id: req.body.file_id,
    },
    attributes: {
      include: [[Sequelize.fn("ST_AsGeoJSON", Sequelize.col("geom")), "geojson_geom"]],
    },
  });

  if (!userFeature && !req.body.addIfNotFound) {
    return {
      status: "failure",
      message: "Failed to access file.",
      data: { id: -1, uuid: "", intent: "" },
    };
  }

  var newAttributes = userFeature.dataValues;

  delete newAttributes["id"];
  delete newAttributes.properties["_"];
  newAttributes.extant_start = time;

  if (req.body.hasOwnProperty("parent")) newAttributes.parent = req.body.parent;
  if (req.body.hasOwnProperty("keywords")) newAttributes.keywords = req.body.keywords;
  if (req.body.hasOwnProperty("intent")) newAttributes.intent = req.body.intent;
  if (req.body.hasOwnProperty("properties")) newAttributes.properties = req.body.properties;
  if (req.body.hasOwnProperty("geometry")) {
    newAttributes.geom = JSON.parse(req.body.geometry);
  } else {
    newAttributes.geom = JSON.parse(userFeature.dataValues.geojson_geom);
  }
  if (req.body.hasOwnProperty("reassignUUID") && req.body.reassignUUID == "true") {
    newAttributes.properties = JSON.parse(newAttributes.properties);
    newAttributes.properties.uuid = uuid();
    newAttributes.properties = JSON.stringify(newAttributes.properties);
  }

  newAttributes.geom.crs = {
    type: "name",
    properties: { name: "EPSG:4326" },
  };

  Userfeatures.create(newAttributes).then((created) => {
    let createdId = created.id;
    let createdUUID = JSON.parse(created.properties).uuid;
    let createdIntent = created.intent;

    if (req.body.to_history) {
      pushToHistory(
        Filehistories,
        req.body.file_id,
        created.id,
        req.body.feature_id,
        time,
        null,
        1,
        () => {
          return {
            status: "success",
            message: "Successfully edited feature.",
            data: { id: createdId, uuid: createdUUID, intent: createdIntent },
          };
        },
        () => {
          return {
            status: "failure",
            message: "Failed to edit feature.",
            data: {},
          };
        }
      );
    } else {
      return {
        status: "success",
        message: "Successfully edited feature.",
        data: { id: createdId, uuid: createdUUID, intent: createdIntent },
      };
    }
  });
}
