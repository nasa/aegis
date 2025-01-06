import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import { hasPerms } from "utils/permissions";
import BoxSDK from "box-node-sdk";

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
  const editPermission = await hasPerms({
    missionId: queryObj.missionId,
    permission: "edit",
    user: req.session.user,
  });
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    // setup access to the Box.com SDK
    const sdkConfig = {
      boxAppSettings: {
        clientID: process.env.BOX_CLIENT_ID,
        clientSecret: process.env.BOX_CLIENT_SECRET,
      },
      enterpriseID: process.env.BOX_ENTERPRISE_ID,
    };
    const sdk = BoxSDK.getPreconfiguredInstance(sdkConfig);
    const client = sdk.getCCGClientForUser(process.env.BOX_USER_ID);

    // use "0" as the root folder which is actually looked up via env variable
    const folderId = queryObj.itemId != "0" ? queryObj.itemId : process.env.BOX_INITIAL_FOLDER_ID;

    // get folder items
    const folderItems: BoxItemsResponse = await client.folders.getItems(folderId);

    // add size attribute to all item entries by getting metadata for each file
    const entriesWithSize: BoxItemEntry[] = await Promise.all(
      folderItems.entries.map(async (entry) => {
        if (entry.type != "file") {
          return entry;
        }
        const fileMetadata = await client.files.get(entry.id);
        return { ...entry, size: fileMetadata.size };
      })
    );

    res.status(200).json({ data: { ...folderItems, entries: entriesWithSize } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
});

export default router;
