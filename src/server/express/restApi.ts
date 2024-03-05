import packageJSON from "../../../package.json";
import express, { Application } from "express";
import cookieSession from "cookie-session";
import cors from "cors";
import authRoutes from "./routes/auth";
import actionRoutes from "./routes/action";
import allRoutes from "./routes/all";
import elevation from "./routes/elevation";
import evaRoutes from "./routes/eva";
import layerRoutes from "./routes/layer";
import logRoutes from "./routes/log";
import missionRoutes from "./routes/mission";
import missionHomepageItemsRoutes from "./routes/missionHomepageItems";
import poiRoutes from "./routes/poi";
import presetRoutes from "./routes/preset";
import rexRoutes from "./routes/rex";
import socketLastEditEventRoutes from "./routes/socketLastEditEvents";
import stationRoutes from "./routes/station";
import stmRoutes from "./routes/stm";
import sublayerRoutes from "./routes/sublayer";
import traverseRoutes from "./routes/traverse";
import usersRoutes from "./routes/users";
import boxDownloadFileRoute from "./routes/file/boxDownloadFile";
import boxGetFolderItems from "./routes/file/boxGetFolderItems";
import fileUploadRoute from "./routes/file/upload";
import fileListRoute from "./routes/file/list";
import fileRenameRoute from "./routes/file/rename";
import fileDeleteRoute from "./routes/file/delete";
import path from "path";

const app: Application = express();

app.use(express.json({ limit: "20mb" }));
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(
  cookieSession({
    name: "aegis-session",
    keys: [process.env.SESSION_PASSWORD],
    maxAge: 24 * 60 * 60 * 1000 * 365, // 1 year
  })
);

// static asset passthrough for dev. This path is one level above src (relative from build output folder)
app.use("/static", express.static(path.join(__dirname, `../../../${process.env.STATIC_DIR}`)));

app.get("/api/v1/version", (req, res) => {
  res.send({ version: packageJSON.version });
});
app.use("/api/v1/auth/", authRoutes);
app.use("/api/v1/action", actionRoutes);
app.use("/api/v1/all", allRoutes);
app.use("/api/v1/elevation", elevation);
app.use("/api/v1/eva", evaRoutes);
app.use("/api/v1/layer", layerRoutes);
app.use("/api/v1/log", logRoutes);
app.use("/api/v1/mission", missionRoutes);
app.use("/api/v1/missionHomepageItems", missionHomepageItemsRoutes);
app.use("/api/v1/poi", poiRoutes);
app.use("/api/v1/preset", presetRoutes);
app.use("/api/v1/rex", rexRoutes);
app.use("/api/v1/socketLastEditEvent", socketLastEditEventRoutes);
app.use("/api/v1/station", stationRoutes);
app.use("/api/v1/stm", stmRoutes);
app.use("/api/v1/sublayer", sublayerRoutes);
app.use("/api/v1/traverse", traverseRoutes);
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/file/boxDownloadFile", boxDownloadFileRoute);
app.use("/api/v1/file/boxGetFolderItems", boxGetFolderItems);
app.use("/api/v1/file/upload", fileUploadRoute);
app.use("/api/v1/file/list", fileListRoute);
app.use("/api/v1/file/rename", fileRenameRoute);
app.use("/api/v1/file/delete", fileDeleteRoute);

export default app;
