import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import path from "node:path";
import { randomUUID } from "node:crypto";

import express from "express";
import multer from "multer";

import { assertMissionFilePath, deleteFile, moveFile, renameFile, unzip } from "server/file/file"; // Assuming these functions are compatible with Express
import { hasPerms } from "utils/permissions";
import { serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

// Express router to replace nextConnect
const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId } = query;
  return {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
};

// Middleware to check user session
router.use(async (req: Request, res: Response, next): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission || (!req.session.appUser.isAdmin && !req.session.appUser.isSuperAdmin)) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "POST",
      responseStatus: 401,
      routeName: "file/upload",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  next();
});

// multer setup
const upload = multer({
  storage: multer.diskStorage({
    destination: process.env.STATIC_DIR, // all files are uploaded into the root STATIC_DIR location
    filename: (req, file, cb) => {
      const filename = `${randomUUID()}-${path.basename(file.originalname)}`;
      cb(null, filename);
      req.on("aborted", () => {
        serverLogger.info({ logId: "file", logValue: `Client aborted upload` });
        deleteFile(filename);
      });
    },
  }),
  limits: {
    fileSize: Infinity,
  },
});

// POST endpoint
router.post("/", upload.single("uploadFile"), async (req: Request, res: Response) => {
  const queryObj = parseQuery(req.query);
  try {
    if (req.file) {
      const filename = req.file.filename;
      assertMissionFilePath(
        queryObj.missionId,
        path.join(req.body.path ?? "", req.body.subfolder ?? "")
      );
      let statusMessage = "File received";
      // File processing logic
      if (path.extname(filename) === ".zip") {
        await unzip(filename, req.body.path, req.body.subfolder); // unzip the file if necessary
        statusMessage = "File received and extracted";
      } else {
        // move to subfolder
        const destination = path.join(req.body.path, req.body.subfolder ?? "");
        await moveFile(filename, destination);
        if (!(await renameFile(destination, filename, req.file.originalname))) {
          await deleteFile(path.join(destination, filename));
          throw new Error("A file with that name already exists in the destination");
        }
      }
      res.status(201).json(statusMessage);
    } else {
      serverLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "POST",
        responseStatus: 400,
        routeName: "file/upload",
        appUsername: req.session?.appUser?.username,
        missionId: queryObj.missionId,
        message: "No file provided in request body",
      });
      res.status(400).json("No file provided in request body");
    }
  } catch (error) {
    if (req.file) await deleteFile(req.file.filename);
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "POST",
      responseStatus: 500,
      routeName: "file/upload",
      appUsername: req.session.appUser?.username,
      missionId: queryObj.missionId,
      message: error instanceof Error ? error.message : "Error uploading file",
      error: asError(error),
    });
    res.status(500).json(error instanceof Error ? error.message : "Error uploading file");
  }
});

export default router;
