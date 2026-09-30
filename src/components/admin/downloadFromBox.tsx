/**
 * The admin view keeps download state keyed by Box item ID. This allows each row to show its own
 * progress and error state while other files remain available to start concurrently.
 */
import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import adminStyles from "components/admin/admin.module.css";
import { boxDownloadFile, boxGetFolderItems, type BoxDownloadProgress } from "http-client/box";
import prettyBytes from "pretty-bytes";

function getDownloadStageText(
  progress: BoxDownloadProgress | undefined,
  downloadPercent: number | undefined
): string {
  if (progress === undefined) return "Starting...";

  switch (progress.stage) {
    case "starting":
      return "Starting...";
    case "downloading":
      if (downloadPercent === undefined) return "Downloading...";
      return `Downloading ${downloadPercent}%`;
    case "extracting":
      return `Extracting ${progress.elapsedSeconds ?? 0}s`;
    case "moving":
      return "Moving...";
    case "complete":
      return "Complete";
  }
}

function getDownloadPercent(progress: BoxDownloadProgress | undefined): number | undefined {
  if (
    progress?.totalBytes === undefined ||
    progress.bytesDownloaded === undefined ||
    progress.totalBytes <= 0
  ) {
    return undefined;
  }

  return Math.min(100, Math.round((progress.bytesDownloaded / progress.totalBytes) * 100));
}

type FolderLoadingTarget =
  | { type: "folder"; id: string }
  | { type: "breadcrumb"; id: string }
  | { type: "parent" };

const FolderLoadingStatus: FunctionComponent = () => (
  <span className={adminStyles.folderLoadingStatus} role="status">
    <span className={adminStyles.folderLoadingSpinner} aria-hidden="true" />
    Loading...
  </span>
);

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
  const [loadingNavigation, setLoadingNavigation] = useState<FolderLoadingTarget | null>(null);
  const [downloadingItems, setDownloadingItems] = useState<Record<string, boolean>>({});
  const [downloadProgress, setDownloadProgress] = useState<Record<string, BoxDownloadProgress>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  const updateFolderItems = async (
    folderId: string,
    loadingTarget: FolderLoadingTarget | null = null
  ) => {
    setLoadingNavigation(loadingTarget);
    try {
      const itemsResponse = await boxGetFolderItems(missionId, folderId);
      setFolderItems(itemsResponse.data);
    } finally {
      setLoadingNavigation((current) => (current === loadingTarget ? null : current));
    }
  };

  const startDownload = async (itemId: string) => {
    setDownloadingItems((current) => ({ ...current, [itemId]: true }));
    setDownloadProgress((current) => ({
      ...current,
      [itemId]: { type: "progress", stage: "starting" },
    }));
    setDownloadErrors((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });

    try {
      const response = await boxDownloadFile(missionId, itemId, path, (progress) => {
        setDownloadProgress((current) => ({ ...current, [itemId]: progress }));
      });
      if (response.status !== "success") {
        setDownloadErrors((current) => ({
          ...current,
          [itemId]: response.message || "Box download failed",
        }));
      } else {
        setRefreshDirectoryListing(true);
      }
    } catch (error) {
      setDownloadErrors((current) => ({
        ...current,
        [itemId]: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setDownloadingItems((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }
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
                style={{ textDecoration: "underline", cursor: "pointer", color: "#60a5fa" }}
                onClick={() => {
                  if (loadingNavigation !== null) return;
                  //if clicking on the last item in the history, do nothing
                  if (index === folderHistory.length - 1) return;
                  //if clicking on the second to last item in the history, go back one level
                  if (index === folderHistory.length - 2) {
                    const parentFolder = folderHistory[folderHistory.length - 2];
                    setFolderHistory(folderHistory.slice(0, folderHistory.length - 1));
                    updateFolderItems(parentFolder.id, {
                      type: "breadcrumb",
                      id: parentFolder.id,
                    });
                  }
                  //if clicking on an item further back in the history, go back to that level
                  else {
                    const targetFolder = folderHistory[index];
                    setFolderHistory(folderHistory.slice(0, index + 1));
                    updateFolderItems(targetFolder.id, { type: "breadcrumb", id: targetFolder.id });
                  }
                }}
              >
                {item.name}
                {loadingNavigation?.type === "breadcrumb" && loadingNavigation.id === item.id && (
                  <FolderLoadingStatus />
                )}
              </span>
            </span>
          ))}
        </div>
        {folderItems && (
          <div>
            <ul>
              <li key="0">
                <div
                  style={{ textDecoration: "underline", cursor: "pointer", color: "#60a5fa" }}
                  onClick={() => {
                    if (loadingNavigation !== null) return;
                    if (folderHistory.length === 1) return; //already at root
                    updateFolderItems(folderHistory[folderHistory.length - 2].id, {
                      type: "parent",
                    });
                    //pop last item off history
                    const newHistory = folderHistory.slice(0, folderHistory.length - 1);
                    setFolderHistory(newHistory);
                  }}
                >
                  ..
                  {loadingNavigation?.type === "parent" && <FolderLoadingStatus />}
                </div>
              </li>
              {folderItems.entries.map((item) => {
                const itemProgress = downloadProgress[item.id];
                const itemPercent = getDownloadPercent(itemProgress);
                const itemStageText = getDownloadStageText(itemProgress, itemPercent);
                const isDownloading = Boolean(downloadingItems[item.id]);

                return (
                  <li key={item.id}>
                    {item.type === "folder" ? (
                      <div
                        style={{ textDecoration: "underline", cursor: "pointer", color: "#60a5fa" }}
                        onClick={() => {
                          if (loadingNavigation !== null) return;
                          setFolderHistory([...folderHistory, item]);
                          updateFolderItems(item.id, { type: "folder", id: item.id });
                        }}
                      >
                        {item.name}
                        {loadingNavigation?.type === "folder" &&
                          loadingNavigation.id === item.id && <FolderLoadingStatus />}
                      </div>
                    ) : (
                      <div>
                        {item.name} ({prettyBytes(item.size)}) -{" "}
                        {isDownloading ? (
                          <span className={adminStyles.downloadStatus} role="status">
                            <progress
                              className={adminStyles.downloadProgress}
                              max={100}
                              value={itemPercent}
                              aria-label="Box download progress"
                            />
                            <span>{itemStageText}</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              textDecoration: "underline",
                              cursor: "pointer",
                              color: "#60a5fa",
                            }}
                            onClick={() => startDownload(item.id)}
                          >
                            Download
                          </span>
                        )}
                        {downloadErrors[item.id] && (
                          <p className={adminStyles.errorItem} role="alert">
                            {downloadErrors[item.id]}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadFromBox;
