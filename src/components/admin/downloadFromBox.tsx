import { FunctionComponent, useEffect, useState } from "react";
import adminStyles from "components/admin/admin.module.css";
import { boxGetFolderItems, boxDownloadFile } from "http-client/box";
import prettyBytes from "pretty-bytes";

const DownloadFromBox: FunctionComponent<{
  missionId: number;
  path: string;
  setRefreshDirectoryListing: Function;
}> = ({ missionId, path, setRefreshDirectoryListing }) => {
  const rootFolderBoxEntry: BoxItemEntry = {
    id: "0",
    type: "folder",
    name: "AEGIS Zips",
    sequence_id: null,
    etag: null,
  };

  const [folderItems, setFolderItems] = useState<BoxItemsResponse>(null);
  const [folderHistory, setFolderHistory] = useState<BoxItemEntry[]>([rootFolderBoxEntry]);
  const [downloadingItem, setDownloadingItem] = useState<string>(null);

  const updateFolderItems = async (folderId: string) => {
    const itemsResponse = await boxGetFolderItems(missionId, folderId);
    setFolderItems(itemsResponse.data);
  };

  useEffect(() => {
    updateFolderItems("0"); //get root folder of the AEGIS layer zips folder at Box.com
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div className={adminStyles.adminContainer}>
      <h2>Download from Box</h2>
      <div className={adminStyles.adminContent}>
        <div className={adminStyles.breadcrumb}>
          {folderHistory.map((item, index) => (
            <span key={item.id}>
              {index !== 0 && " > "}
              <span
                style={{ textDecoration: "underline", cursor: "pointer", color: "blue" }}
                onClick={() => {
                  //if clicking on the last item in the history, do nothing
                  if (index === folderHistory.length - 1) return;
                  //if clicking on the second to last item in the history, go back one level
                  if (index === folderHistory.length - 2) {
                    setFolderHistory(folderHistory.slice(0, folderHistory.length - 1));
                    updateFolderItems(folderHistory[folderHistory.length - 2].id);
                  }
                  //if clicking on an item further back in the history, go back to that level
                  else {
                    setFolderHistory(folderHistory.slice(0, index + 1));
                    updateFolderItems(folderHistory[index].id);
                  }
                }}
              >
                {item.name}
              </span>
            </span>
          ))}
        </div>
        {folderItems && (
          <div>
            <ul>
              <li key="0">
                <div
                  style={{ textDecoration: "underline", cursor: "pointer", color: "blue" }}
                  onClick={() => {
                    if (folderHistory.length === 1) return; //already at root
                    updateFolderItems(folderHistory[folderHistory.length - 2].id);
                    //pop last item off history
                    const newHistory = folderHistory.slice(0, folderHistory.length - 1);
                    setFolderHistory(newHistory);
                  }}
                >
                  ..
                </div>
              </li>
              {folderItems.entries.map((item) => (
                <li key={item.id}>
                  {item.type === "folder" ? (
                    <div
                      style={{ textDecoration: "underline", cursor: "pointer", color: "blue" }}
                      onClick={() => {
                        setFolderHistory([...folderHistory, item]);
                        updateFolderItems(item.id);
                      }}
                    >
                      {item.name}
                    </div>
                  ) : (
                    <div>
                      {item.name} ({prettyBytes(item.size)}) -{" "}
                      {downloadingItem === item.id ? (
                        <>Downloading...</>
                      ) : (
                        <>
                          {!downloadingItem && (
                            <span
                              style={{
                                textDecoration: "underline",
                                cursor: "pointer",
                                color: "blue",
                              }}
                              onClick={async () => {
                                setDownloadingItem(item.id);
                                await boxDownloadFile(missionId, item.id, path);
                                setDownloadingItem(null);
                                setRefreshDirectoryListing(true);
                              }}
                            >
                              Download
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadFromBox;
