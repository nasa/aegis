import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import { BoxClient, BoxCcgAuth, CcgConfig } from "box-node-sdk";
import express from "express";

import { hasPerms } from "utils/permissions";
import { ConsoleLogger as serverLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, itemId } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    itemId: itemId ? itemId.toString() : null,
  };

  return queryObj;
};

// get boxDownloadFile
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const queryObj = parseQuery(req.query);
  const editPermission = hasPerms({
    missionId: queryObj.missionId,
    permission: "edit",
    appUser: req.session.appUser,
  });
  if (!editPermission) {
    serverLogger.apiRoute({
      logLevel: "warning",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "file/boxGetFolderItems",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: [queryObj.itemId],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    // setup access to the Box.com SDK
    const auth = new BoxCcgAuth({
      config: new CcgConfig({
        clientId: process.env.BOX_CLIENT_ID,
        clientSecret: process.env.BOX_CLIENT_SECRET,
        enterpriseId: process.env.BOX_ENTERPRISE_ID,
        userId: process.env.BOX_USER_ID,
      }),
    });
    const client = new BoxClient({ auth });

    // use "0" as the root folder which is actually looked up via env variable
    const folderId = queryObj.itemId != "0" ? queryObj.itemId : process.env.BOX_INITIAL_FOLDER_ID;

    // get folder items
    const folderItems = await client.folders.getFolderItems(folderId);

    // add size attribute to all item entries by getting metadata for each file
    const entriesWithSize = await Promise.all(
      folderItems.entries.map(async (entry) => {
        if (entry.type != "file") {
          return entry;
        }
        const fileMetadata = await client.files.getFileById(entry.id);
        return { ...entry, size: fileMetadata.size };
      })
    );

    res.status(200).json({ data: { ...folderItems, entries: entriesWithSize } });
  } catch (e) {
    serverLogger.apiRoute({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "file/boxGetFolderItems",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: [queryObj.itemId],
      message: e.toString(),
      error: asError(e),
    });
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
