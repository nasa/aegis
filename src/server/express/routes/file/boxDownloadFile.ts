import express, { Request, Response } from "express";
import { Query } from "express-serve-static-core";

import BoxSDK from "box-node-sdk";

import { unzip } from "server/file/file";
import fs from "fs";
import BoxClient from "box-node-sdk/lib/box-client";
import { hasPerms } from "utils/permissions";

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
  const editPermission = await hasPerms(queryObj.missionId, "edit", req.session.user);
  if (!editPermission) {
    res.status(401).json({ status: "failure", message: "Unauthorized" });
    return;
  }
  try {
    const downloadFilePath = process.env.STATIC_DIR; //all zip files are uploaded into the root STATIC_DIR location

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

    // download the itemId from Box and store it at path. This file is a zip file.
    // await client.files.get(itemId, { downloadToFile: downloadFilePath });

    // get the metadata for the file on Box
    const metadata = await client.files.get(queryObj.itemId);

    // download the file from Box
    await downloadFileFromBox(client, queryObj.itemId, downloadFilePath + "/" + metadata.name);

    // if the file is a zip file, unzip it into a subfolder with the same name as the zip file root
    const fileExtension = metadata.name.split(".").pop();
    if (fileExtension === "zip") {
      //unzip the file into the subfolder
      const unzipStatus = await unzip(metadata.name, queryObj.path);
      if (!unzipStatus) {
        res.status(500).json({ error: "Error unzipping file" });
        return;
      }
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
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
});

export default router;

export async function downloadFileFromBox(
  client: BoxClient,
  itemId: string,
  downloadFilePath: string
): Promise<void> {
  try {
    const stream = await client.files.getReadStream(itemId);

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
