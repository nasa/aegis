import type { Application } from "express";
import express from "express";
import cookieSession from "cookie-session";
import cors from "cors";
import { globalValues } from "./global";
import path from "node:path";
import { fileURLToPath } from "url";
import { RequestContext } from "@mikro-orm/postgresql";

import authRoutes from "./routes/auth";
import allRoutes from "./routes/all";
import terrainProfile from "./routes/terrainProfile";
import layerRoutes from "./routes/layer";
import missionRoutes from "./routes/mission";
import missionHomepageItemsRoutes from "./routes/missionHomepageItems";
import missionDup from "./routes/missionDup";
import missionDump from "./routes/missionDump";
import metricsRoutes from "./routes/metrics";
import presetRoutes from "./routes/preset";
import gridRoutes from "./routes/grid";
import stmRoutes from "./routes/stm";
import stmRulesRoutes from "./routes/stmRules";
import sublayerRoutes from "./routes/sublayer";
import appUsersRoutes from "./routes/appUsers";
import timeRoutes from "./routes/time";
import folderRoutes from "./routes/folder";

import rexByEvaRef from "../maestro/v1/routes/getRexesByEvaRef";
import getMissions from "../maestro/v1/routes/getMissions";
import readableEvaRoutes from "../maestro/v1/routes/eva";
import readableMissionRoutes from "../maestro/v1/routes/mission";

import rexByEvaRefV2 from "../maestro/v2/routes/getRexesByEvaRef";
import getMissionsV2 from "../maestro/v2/routes/getMissions";
import readableEvaRoutesV2 from "../maestro/v2/routes/eva";
import readableMissionRoutesV2 from "../maestro/v2/routes/mission";
import docCreateV2 from "../maestro/v2/routes/docCreate";

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
import { rawServerLogger } from "utils/logging/serverLogger";
import { getUser } from "packages/getUser";
import { handleUnableToDecodeJWT } from "@emss/oauth2-proxy-backend";

import docListingRoute from "./routes/docListing";
import environmentConfigRoute from "./routes/environmentConfig";
import missionAutomergeRoutes from "./routes/missionAutomerge";

import dustRoute from "./routes/external/dust";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// static asset passthrough for dev. This path is relative to the esbuild output dir (.local/express/dist/api)
app.use("/static", express.static(path.join(__dirname, `../../../../${process.env.STATIC_DIR}`)));

// socket stuff
app.use("/api/v1/socket/serverSocketStatus", serverSocketStatus);
app.use("/api/v1/socket/lastEditEvent", socketLastEditEventRoutes);

// Mikro-ORM RequestContext should be last middleware before routes
// <https://mikro-orm.io/docs/identity-map#request-context>
// use Mikro-ORM RequestContext for express and socketio handlers
app.use((_req, _res, next) => {
  RequestContext.create(globalValues.orm.em, next);
});

// get user info from launchpad
app.get("/api/v1/user/current", (req, res) => {
  const user = getUser(req);
  if (user instanceof Error) {
    return handleUnableToDecodeJWT(user, res);
  }
  res.json({ user });
  rawServerLogger.logUserLogin(user);
});

// Serve a successful response. For use with wait-on
app.get("/api/v1/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.send({ status: "ok" });
});

// get app version
app.get("/api/v1/version", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.send(globalValues.appVersion);
});

app.use("/api/v1/auth/", authRoutes);
app.use("/api/v1/all", allRoutes);
app.use("/api/v1/terrain-profile", terrainProfile);
app.use("/api/v1/grid", gridRoutes);
app.use("/api/v1/layer", layerRoutes);
app.use("/api/v1/mission", missionRoutes);
app.use("/api/v1/missionAutomerge", missionAutomergeRoutes);
app.use("/api/v1/missionHomepageItems", missionHomepageItemsRoutes);
app.use("/api/v1/missionDup", missionDup);
app.use("/api/v1/missionDump", missionDump);
app.use("/api/v1/metrics", metricsRoutes);
app.use("/api/v1/preset", presetRoutes);
app.use("/api/v1/stm", stmRoutes);
app.use("/api/v1/stmRules", stmRulesRoutes);
app.use("/api/v1/sublayer", sublayerRoutes);
app.use("/api/v1/appUsers", appUsersRoutes);
app.use("/api/v1/time", timeRoutes);
app.use("/api/v1/file/boxDownloadFile", boxDownloadFileRoute);
app.use("/api/v1/file/boxGetFolderItems", boxGetFolderItems);
app.use("/api/v1/file/upload", fileUploadRoute);
app.use("/api/v1/file/list", fileListRoute);
app.use("/api/v1/file/rename", fileRenameRoute);
app.use("/api/v1/file/delete", fileDeleteRoute);
app.use("/api/v1/log/from-client", logFromClient);
app.use("/api/v1/folder", folderRoutes);
app.use("/api/v1/docListing", docListingRoute);
app.use("/api/v1/environmentConfig", environmentConfigRoute);

// require emssToken auth only
app.use("/api/v1/emss/enableEmssApi", enableEmssApi);

// Maegistro V1
app.use("/api/v1/readable/eva", readableEvaRoutes);
app.use("/api/v1/readable/mission", readableMissionRoutes);
app.use("/api/v1/emss/getRexesByEvaRef", rexByEvaRef);
app.use("/api/v1/emss/getMissions", getMissions);

// Maegistro V2
app.use("/api/v1/maestro/v2/eva", readableEvaRoutesV2);
app.use("/api/v1/maestro/v2/mission", readableMissionRoutesV2);
app.use("/api/v1/maestro/v2/getRexesByEvaRef", rexByEvaRefV2);
app.use("/api/v1/maestro/v2/getMissions", getMissionsV2);
app.use("/api/v1/maestro/v2/doc/create", docCreateV2);

// external endpoints used by other stakeholders
app.use("/api/v1/external/dust", dustRoute);

export default app;
