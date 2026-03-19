import type { Request, Response } from "express";
import type { Query } from "express-serve-static-core";

import fs from "node:fs";

import { BoxClient, BoxCcgAuth, CcgConfig } from "box-node-sdk";
import express from "express";

import { unzip } from "server/file/file";
import { hasPerms } from "utils/permissions";
import { apiRouteLogger } from "utils/logging/serverLogger";
import { asError } from "@emss/utils";

const router = express.Router();

const parseQuery = (query: Query) => {
  const { missionId, itemId, path } = query;
  const queryObj = {
    missionId: missionId ? parseInt(missionId as string) : undefined,
    itemId: itemId ? itemId.toString() : null,
    path: path ? path.toString() : null,
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
    apiRouteLogger({
      logLevel: "warn",
      httpMethod: "GET",
      responseStatus: 401,
      routeName: "file/boxDownloadFile",
      appUsername: req.session?.appUser?.username,
      missionId: queryObj.missionId,
      uuids: [queryObj.itemId],
      message: "Unauthorized",
    });
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const downloadFilePath = process.env.STATIC_DIR; //all zip files are uploaded into the root STATIC_DIR location

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

    // download the itemId from Box and store it at path. This file is a zip file.
    // await client.files.get(itemId, { downloadToFile: downloadFilePath });

    // get the metadata for the file on Box
    const metadata = await client.files.getFileById(queryObj.itemId);

    // download the file from Box
    await downloadFileFromBox(client, queryObj.itemId, downloadFilePath + "/" + metadata.name);

    // if the file is a zip file, unzip it into a subfolder with the same name as the zip file root
    const fileExtension = metadata.name.split(".").pop();
    if (fileExtension === "zip") {
      //unzip the file into the subfolder
      await unzip(metadata.name, queryObj.path);
    } else {
      // if the file is not a zip file, move it to the correct location

      // make sure the path exists
      if (!fs.existsSync(downloadFilePath + "/" + queryObj.path)) {
        fs.mkdirSync(downloadFilePath + "/" + queryObj.path, { recursive: true });
      }

      // Non-issue: this is not using user-supplied values for FS function
      // nosemgrep: eslint.detect-non-literal-fs-filename
      fs.renameSync(
        downloadFilePath + "/" + metadata.name,
        downloadFilePath + "/" + queryObj.path + "/" + metadata.name
      );
    }

    res.status(200).json({ data: { success: true } });
  } catch (e) {
    apiRouteLogger({
      logLevel: "error",
      httpMethod: "GET",
      responseStatus: 500,
      routeName: "file/boxDownloadFile",
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

async function downloadFileFromBox(
  client: BoxClient,
  itemId: string,
  downloadFilePath: string
): Promise<void> {
  try {
    const stream = await client.downloads.downloadFile(itemId);
    if (!stream) {
      throw new Error(`Failed to get download stream for file ${itemId}`);
    }

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(downloadFilePath);
      stream.pipe(output);

      output.on("finish", resolve);
      output.on("error", reject);
      stream.on("error", reject);
    });
  } catch (error) {
    // handle error
    console.error(error);
  }
}
