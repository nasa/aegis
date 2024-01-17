import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import BoxSDK from "box-node-sdk";
import { ironOptions } from "utils/ironSession";
import { unzip } from "server/file/file";
import fs from "fs";
import BoxClient from "box-node-sdk/lib/box-client";

const handler: NextApiHandler<WrappedResponse<BoxItemsResponse>> = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<unknown> => {
  try {
    const { itemId, path } = req.query as { [key: string]: string };

    const downloadFilePath = process.env.PUBLIC_STATIC_DIR; //all zip files are uploaded into the root PUBLIC_STATIC_DIR location

    if (!req.session.user) {
      res.status(401).json("Unauthorized");
      return;
    }

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
    const metadata = await client.files.get(itemId);

    // download the file from Box
    await downloadFileFromBox(client, itemId, downloadFilePath + "/" + metadata.name);

    // if the file is a zip file, unzip it into a subfolder with the same name as the zip file root
    const fileExtension = metadata.name.split(".").pop();
    if (fileExtension === "zip") {
      //unzip the file into the subfolder
      const unzipStatus = await unzip(metadata.name, path);
      if (!unzipStatus) {
        res.status(500).json({ error: "Error unzipping file" });
        return;
      }
    } else {
      // if the file is not a zip file, move it to the correct location

      // Non-issue: this is not using user-supplied values for FS function
      // nosemgrep: eslint.detect-non-literal-fs-filename
      fs.renameSync(
        downloadFilePath + "/" + metadata.name,
        downloadFilePath + "/" + path + "/" + metadata.name
      );
    }

    res.status(200).json({ data: { success: true } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.toString() });
  }
};

export default withIronSessionApiRoute(handler, ironOptions);

async function downloadFileFromBox(client: BoxClient, itemId: string, downloadFilePath: string) {
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
