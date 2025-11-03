import express, { Application } from "express";
import cookieSession from "cookie-session";
import cors from "cors";
import { globalValues } from "./global";
import path from "path";

import authRoutes from "./routes/auth";
import actionRoutes from "./routes/action";
import allRoutes from "./routes/all";
import elevation from "./routes/elevation";
import evaRoutes from "./routes/eva";
import layerRoutes from "./routes/layer";
import missionRoutes from "./routes/mission";
import missionHomepageItemsRoutes from "./routes/missionHomepageItems";
import missionDup from "./routes/missionDup";
import missionDump from "./routes/missionDump";
import poiRoutes from "./routes/poi";
import presetRoutes from "./routes/preset";
import rexRoutes from "./routes/rex";
import stationRoutes from "./routes/station";
import gridRoutes from "./routes/grid";
import stmRoutes from "./routes/stm";
import stmRulesRoutes from "./routes/stmRules";
import sublayerRoutes from "./routes/sublayer";
import traverseRoutes from "./routes/traverse";
import usersRoutes from "./routes/users";
import timeRoutes from "./routes/time";
import folderRoutes from "./routes/folder";

import rexControl from "./routes/emss/rexControl";
import rexByEvaRef from "./routes/emss/getRexesByEvaRef";
import getMissions from "./routes/emss/getMissions";
import rexOverwrite from "./routes/emss/rexOverwrite";
import enableEmssApi from "./routes/emss/enableEmssApi";

import socketLastEditEventRoutes from "./routes/socket/lastEditEvent";
import serverSocketStatus from "./routes/socket/serverSocketStatus";

import boxDownloadFileRoute from "./routes/file/boxDownloadFile";
import boxGetFolderItems from "./routes/file/boxGetFolderItems";
import fileUploadRoute from "./routes/file/upload";
import fileListRoute from "./routes/file/list";
import fileRenameRoute from "./routes/file/rename";
import fileDeleteRoute from "./routes/file/delete";

import logFromClient from "./routes/logFromClient";
import serverLogger from "utils/logging/serverLogger";
import { getUser } from "packages/getUser";
import { handleUnableToDecodeJWT } from "@emss/oauth2-proxy-backend";

import readableActionRoutes from "./routes/readable/action";
import readableStationRoutes from "./routes/readable/station";
import readableEvaRoutes from "./routes/readable/eva";
import readableMissionRoutes from "./routes/readable/mission";
import readableTraverseRoutes from "./routes/readable/traverse";

const app: Application = express();

app.use(express.json({ limit: "40mb" }));
app.use(cors());
app.use(express.urlencoded({ limit: "40mb", extended: true }));
app.use(
  cookieSession({
    name: "aegis-session",
    keys: [process.env.SESSION_PASSWORD],
    maxAge: 24 * 60 * 60 * 1000 * 365, // 1 year
  })
);
// static asset passthrough for dev. This path is one level above src (relative from build output folder)
app.use("/static", express.static(path.join(__dirname, `../../../${process.env.STATIC_DIR}`)));

// get user info from launchpad
app.get("/api/v1/user/current", (req, res) => {
  const user = getUser(req);
  if (user instanceof Error) {
    return handleUnableToDecodeJWT(user, res);
  }
  res.json({ user });
  serverLogger.logUserLogin(user);
});

// Serve a successful response. For use with wait-on
app.get("/api/v1/health", (req, res) => {
  res.send({ status: "ok" });
});

// socket stuff
app.use("/api/v1/socket/serverSocketStatus", serverSocketStatus);
app.use("/api/v1/socket/lastEditEvent", socketLastEditEventRoutes);

// get app version
app.get("/api/v1/version", (req, res) => {
  res.send(globalValues.appVersion);
});

app.use("/api/v1/auth/", authRoutes);
app.use("/api/v1/action", actionRoutes);
app.use("/api/v1/all", allRoutes);
app.use("/api/v1/elevation", elevation);
app.use("/api/v1/eva", evaRoutes);
app.use("/api/v1/grid", gridRoutes);
app.use("/api/v1/layer", layerRoutes);
app.use("/api/v1/mission", missionRoutes);
app.use("/api/v1/missionHomepageItems", missionHomepageItemsRoutes);
app.use("/api/v1/missionDup", missionDup);
app.use("/api/v1/missionDump", missionDump);
app.use("/api/v1/poi", poiRoutes);
app.use("/api/v1/preset", presetRoutes);
app.use("/api/v1/rex", rexRoutes);
app.use("/api/v1/station", stationRoutes);
app.use("/api/v1/stm", stmRoutes);
app.use("/api/v1/stmRules", stmRulesRoutes);
app.use("/api/v1/sublayer", sublayerRoutes);
app.use("/api/v1/traverse", traverseRoutes);
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/time", timeRoutes); // Added route
app.use("/api/v1/file/boxDownloadFile", boxDownloadFileRoute);
app.use("/api/v1/file/boxGetFolderItems", boxGetFolderItems);
app.use("/api/v1/file/upload", fileUploadRoute);
app.use("/api/v1/file/list", fileListRoute);
app.use("/api/v1/file/rename", fileRenameRoute);
app.use("/api/v1/file/delete", fileDeleteRoute);
app.use("/api/v1/log/from-client", logFromClient);
app.use("/api/v1/folder", folderRoutes);

// readable endpoints
app.use("/api/v1/readable/action", readableActionRoutes);
app.use("/api/v1/readable/station", readableStationRoutes);
app.use("/api/v1/readable/eva", readableEvaRoutes);
app.use("/api/v1/readable/mission", readableMissionRoutes);
app.use("/api/v1/readable/traverse", readableTraverseRoutes);

// endpoints that require emssToken auth only
app.use("/api/v1/emss/rexControl", rexControl);
app.use("/api/v1/emss/getRexesByEvaRef", rexByEvaRef);
app.use("/api/v1/emss/getMissions", getMissions);
app.use("/api/v1/emss/enableEmssApi", enableEmssApi);
app.use("/api/v1/emss/rexOverwrite", rexOverwrite);

export default app;
