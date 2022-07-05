import type { NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import Sequelize from "sequelize";
import { uuid } from "uuidv4";

import { ironOptions } from "server/session/config";
import { Userfiles } from "server/db/Draw/models/userfiles";
import { Userfeatures } from "server/db/Draw/models/userfeatures";
import { Filehistories } from "server/db/Draw/models/filehistories";
import { pushToHistory } from "server/api_utils/files";
import { editFeature } from "./feature_edit";

// import { getSequelizeConnection } from "server/db/connection";

// export default withIronSessionApiRoute(handler, ironOptions);

// async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
//   try {
//     if (req.session.user) {
//       const files = await addFeature(req.session.user.username as string, req);
//       res.status(200).json(files);
//     } else {
//       res.status(401).json({ status: "failure", message: "Unauthorized" });
//     }
//   } catch (error) {
//     res.status(500).json({ status: "error", message: "Failed to add feature." + error });
//   }
// }

// async function addFeature(username: string, req: any) {
//   let time = Math.floor(Date.now());

//   let groups = [];
//   if (req.groups) groups = Object.keys(req.groups);

//   if (req.body.to_history == null) req.body.to_history = true;

//   //Check that the provided file_id is an id that belongs to the current user
//   const userFile = await Userfiles.findOne({
//     where: {
//       id: req.body.file_id,
//       [Sequelize.Op.or]: {
//         file_owner: req.user,
//         [Sequelize.Op.and]: {
//           file_owner: "group",
//           file_owner_group: { [Sequelize.Op.overlap]: groups },
//         },
//       },
//     },
//   });

//   if (!userFile) {
//     return {
//       status: "failure",
//       message: "Failed to access file.",
//       body: {},
//     };
//   }

//   //Find the next level
//   const order = req.body.order == "min" || req.body.order < 0 ? "min" : "max";

//   const userFeatures = await Userfeatures.findAll({
//     where: {
//       file_id: req.body.file_id,
//     },
//   });

//   let level;
//   let maxLevel = -Infinity;
//   let minLevel = Infinity;
//   if (userFeatures && userFeatures.length > 0) {
//     for (let i = 0; i < userFeatures.length; i++) {
//       maxLevel = Math.max(userFeatures[i].level, maxLevel);
//       minLevel = Math.min(userFeatures[i].level, minLevel);
//     }
//     if (order === "max") return maxLevel + 1;
//     else level = minLevel - 1;
//   } else level = 0;

//   let properties = req.body.properties || {};
//   //Remove _ from properties if it has it. This is because the server returns metadata
//   // under _ and we don't want it to potentially nest
//   delete properties["_"];

//   let geom = JSON.parse(req.body.geometry);
//   //Geometry needs this for the spatialiness to work
//   geom.crs = { type: "name", properties: { name: "EPSG:4326" } };

//   let newFeature = {
//     file_id: req.body.file_id,
//     level: level,
//     intent: req.body.intent,
//     elevated: "0",
//     properties: properties,
//     geom: geom,
//   };

//   if (req.query.clip === "under") {
//     clipUnder(
//       req,
//       newFeature,
//       time,
//       (createdId, createdIntent) => {
//         return {
//           status: "success",
//           message: "Successfully added a new feature.",
//           body: { id: createdId, intent: createdIntent },
//         };
//       },
//       (err) => {
//         return {
//           status: "failure",
//           message: `Failed to add new feature ${err}`,
//           body: {},
//         };
//       }
//     );
//   } else {
//     newFeature.properties = JSON.parse(newFeature.properties);
//     newFeature.properties.uuid = uuid();
//     newFeature.properties = JSON.stringify(newFeature.properties);
//     // Insert new feature into the feature table
//     const created = await Userfeatures.create(newFeature);

//     if (req.body.to_history) {
//       let id = created.id;
//       if (req.body.bulk_ids != null) {
//         id = req.body.bulk_ids;
//         id.push(created.id);
//       }
//       if (req.body.clip === "over") {
//         clipOver(
//           req,
//           newFeature.file_id,
//           id,
//           time,
//           () => {
//             return {
//               status: "success",
//               message: "Successfully added a new feature.",
//               body: { id: created.id, intent: created.intent },
//             };
//           },
//           (err) => {
//             return {
//               status: "failure",
//               message: `Failed to add new feature ${err}`,
//               body: {},
//             };
//           }
//         );
//       } else {
//         pushToHistory(
//           Filehistories,
//           req.body.file_id,
//           id,
//           null,
//           time,
//           null,
//           0,
//           () => {
//             return {
//               status: "success",
//               message: "Successfully added a new feature.",
//               body: { id: created.id, intent: created.intent },
//             };
//           },
//           (err) => {
//             return {
//               status: "failure",
//               message: `Failed to add new feature ${err}`,
//               body: {},
//             };
//           }
//         );
//       }
//     } else {
//       return {
//         status: "success",
//         message: "Successfully added a new feature.",
//         body: { id: created.id, intent: created.intent },
//       };
//     }
//     return null;
//   }

//   return null;
// }

// /**
//  *
//  * @param {number} file_id
//  * @param {number} added_id
//  */
// const clipOver = function (req, file_id, added_id, time, successCallback, failureCallback) {
//   const sequelize = getSequelizeConnection();

//   //CLIP OVER
//   Filehistories.findAll({
//     limit: 1,
//     where: {
//       file_id: file_id,
//     },
//     order: [["history_id", "DESC"]],
//   })
//     .then((lastHistory) => {
//       let maxHistoryId = -Infinity;
//       let bestI = -1;
//       if (lastHistory && lastHistory.length > 0) {
//         return {
//           historyIndex: lastHistory[0].history_id + 1,
//           history: lastHistory[0].history,
//         };
//       } else return { historyIndex: 0, history: [] };
//     })
//     .then((historyObj) => {
//       let history = historyObj.history;
//       history = history.join(",");
//       history = history || "NULL";
//       //RETURN ALL THE CHANGED SHAPE IDs AND GEOMETRIES
//       let q = [
//         "SELECT clipped.id, ST_AsGeoJSON( (ST_Dump(clipped.newgeom)).geom ) AS newgeom FROM",
//         "(",
//         "SELECT data.id, data.newgeom",
//         "FROM (",
//         "SELECT r.id, ST_DIFFERENCE(ST_MakeValid(r.geom),",
//         "ST_MakeValid((",
//         "SELECT a.geom",
//         "FROM user_features" + (req.body.test === "true" ? "_tests" : "") + " AS a",
//         "WHERE a.id = :added_id AND ST_INTERSECTS(a.geom, r.geom)",
//         "))",
//         ") AS newgeom",
//         "FROM user_features" + (req.body.test === "true" ? "_tests" : "") + " AS r",
//         "WHERE r.file_id = :file_id AND r.id != :added_id AND r.id IN (" + history + ")",
//         ") data",
//         "WHERE data.newgeom IS NOT NULL",
//         ") AS clipped",
//       ].join(" ");
//       sequelize
//         .query(q, {
//           replacements: {
//             file_id: file_id,
//             added_id: added_id,
//           },
//         })
//         .spread((results) => {
//           let oldIds = [];
//           let newIds = [added_id];

//           editLoop(0);
//           async function editLoop(i) {
//             if (i >= results.length) {
//               pushToHistory(
//                 Filehistories,
//                 req.body.file_id,
//                 newIds,
//                 oldIds,
//                 time,
//                 null,
//                 5,
//                 () => {
//                   if (typeof successCallback === "function") successCallback();
//                 },
//                 (err) => {
//                   if (typeof failureCallback === "function") failureCallback(err);
//                 }
//               );
//               return;
//             }
//             let newReq = Object.assign({}, req);
//             results[i].newgeom.crs = {
//               type: "name",
//               properties: { name: "EPSG:4326" },
//             };
//             newReq.body = {
//               file_id: file_id,
//               feature_id: results[i].id,
//               geometry: results[i].newgeom,
//               to_history: false,
//               test: req.body.test,
//             };

//             if (oldIds.indexOf(results[i].id) == -1) oldIds.push(results[i].id);
//             const editResponse = await editFeature(
//               newReq,
//             );

//             const newId = editResponse.status === "success" ? editResponse.data.id : null;
//               res,
//               (newId) => {
//                 newIds.push(newId);
//                 editLoop(i + 1);
//               },
//               () => {
//                 editLoop(i + 1);
//               }
//             );
//           }

//           return null;
//         })
//         .catch((err) => {
//           failureCallback(err);
//         });

//       return null;
//     })
//     .catch((err) => {
//       failureCallback(err);
//     });
// };

// const clipUnder = function (req, newFeature, time, successCallback, failureCallback) {
//   const sequelize = getSequelizeConnection();

//   Filehistories.findAll({
//     limit: 1,
//     where: {
//       file_id: newFeature.file_id,
//     },
//     order: [["history_id", "DESC"]],
//   })
//     .then((lastHistory) => {
//       let maxHistoryId = -Infinity;
//       let bestI = -1;
//       if (lastHistory && lastHistory.length > 0) {
//         return {
//           historyIndex: lastHistory[0].history_id + 1,
//           history: lastHistory[0].history,
//         };
//       } else return { historyIndex: 0, history: [] };
//     })
//     .then((historyObj) => {
//       let history = historyObj.history;
//       history = history.join(",");
//       history = history || "NULL";

//       //Continually clip the added feature with the other features of the file
//       let q = [
//         "WITH RECURSIVE clipper (n, clippedgeom) AS (",
//         "SELECT 0 n, ST_MakeValid(ST_GeomFromGeoJSON(:geom)) clippedgeom",
//         "UNION ALL",
//         "SELECT n+1, ST_DIFFERENCE(",
//         "clippedgeom,",
//         "(",
//         "SELECT ST_BUFFER(",
//         "ST_UNION(",
//         "ARRAY((",
//         "SELECT ST_BUFFER(a.geom, 0.000001, 'join=mitre')",
//         "FROM user_features" + (req.body.test === "true" ? "_tests" : "") + " AS a",
//         "WHERE a.id IN (" + history + ") AND ST_INTERSECTS(a.geom, clippedgeom)",
//         "))",
//         "),",
//         "-0.000001,'join=mitre')",
//         ")",
//         ")",
//         "FROM clipper",
//         "WHERE n < 1",
//         ")",
//         "SELECT ST_AsGeoJSON( (ST_Dump(clipped.clippedgeom)).geom ) as geom FROM",
//         "(",
//         "SELECT c.n, c.clippedgeom as clippedgeom FROM clipper c",
//         "WHERE c.clippedgeom IS NOT NULL",
//         "ORDER by c.n DESC LIMIT 1",
//         ") AS clipped",
//       ].join(" ");

//       sequelize
//         .query(q, {
//           replacements: {
//             geom: JSON.stringify(newFeature.geom),
//           },
//         })
//         .spread((results) => {
//           let oldIds = [];
//           let newIds = [];

//           addLoop(0);
//           function addLoop(i) {
//             if (i >= results.length) {
//               pushToHistory(
//                 Filehistories,
//                 req.body.file_id,
//                 newIds,
//                 oldIds,
//                 time,
//                 null,
//                 7,
//                 () => {
//                   if (typeof successCallback === "function") successCallback();
//                 },
//                 (err) => {
//                   if (typeof failureCallback === "function") failureCallback(err);
//                 }
//               );
//               return null;
//             }
//             let clippedFeature = Object.assign({}, newFeature);
//             clippedFeature.properties = JSON.parse(newFeature.properties);
//             clippedFeature.geom = JSON.parse(results[i].geom);
//             clippedFeature.geom.crs = {
//               type: "name",
//               properties: { name: "EPSG:4326" },
//             };
//             clippedFeature.properties.uuid = uuid();
//             clippedFeature.properties = JSON.stringify(clippedFeature.properties);

//             Userfeatures.create(clippedFeature)
//               .then((created) => {
//                 newIds.push(created.id);
//                 //now update the
//                 addLoop(i + 1);
//                 return null;
//               })
//               .catch((err) => {
//                 addLoop(i + 1);
//                 return null;
//                 //failureCallback();
//               });
//           }

//           return null;
//         })
//         .catch((err) => {
//           failureCallback(err);
//         });

//       return null;
//     })
//     .catch((err) => {
//       failureCallback(err);
//     });
// };
