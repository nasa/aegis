import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import multer from "multer";
import path from "path";
import { deleteFile, unzip } from "server/file/file"; // Assuming these functions are compatible with Express

import { hasPerms } from "utils/permissions";

// Express router to replace nextConnect
const router = express.Router();

let filename = "";

const parseQuery = (query: Query) => {
  const { missionId } = query;
  return {
    missionId: missionId ? parseInt(missionId as string) : undefined,
  };
};

// Middleware to check user session
router.use(async (req: Request, res: Response, next): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission || (!req.session.appUser.isAdmin && !req.session.appUser.isSuperAdmin)) {
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
      cb(null, file.originalname);
      filename = file.originalname;
      req.on("aborted", () => {
        console.log(`${new Date()} - Client aborted upload`);
        deleteFile(filename);
      });
    },
  }),
  fileFilter: (req, file, cb) => {
    // only accept zip files
    if (path.extname(file.originalname) === ".zip" && file.mimetype.includes("zip")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only .zip files are allowed"));
    }
  },
  limits: {
    fileSize: Infinity,
  },
});

// POST endpoint
router.post("/", upload.single("uploadFile"), async (req, res) => {
  try {
    if (req.file) {
      // File processing logic
      const unzipStatus = await unzip(filename, req.body.path, req.body.subfolder); // unzip the file
      if (unzipStatus) {
        res.status(200).json("File extracted");
      } else {
        res.status(500).json("File extraction failed. Check server logs");
      }
    } else {
      res.status(400).json("No file provided in request body");
    }
  } catch (error) {
    res.status(400).json(error instanceof Error ? error.message : "Error uploading file");
  }
});

export default router;
