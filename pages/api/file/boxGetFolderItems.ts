import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { withIronSessionApiRoute } from "iron-session/next";
import BoxSDK from "box-node-sdk";
import { ironOptions } from "utils/ironSession";

const handler: NextApiHandler<WrappedResponse<BoxItemsResponse>> = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<unknown> => {
  try {
    const { itemId } = req.query as { [key: string]: string };

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

    const folderId = itemId != "0" ? itemId : process.env.BOX_INITIAL_FOLDER_ID;

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
};

export default withIronSessionApiRoute(handler, ironOptions);
