import {
  Dispatch,
  FunctionComponent,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import { listFiles, deleteFile, renameFile } from "http-client/file";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/internal-api";
import UploadFile from "./uploadFile";
import adminStyles from "components/admin/admin.module.css";

const FileManager: FunctionComponent<{
  path: string;
  setFileList?: Dispatch<SetStateAction<GISfile[]>>; //optional to pass back updated file listing
  isUsed?: (folderName: string) => boolean; //optional check to display message if this folder is in use by the config
}> = (props: {
  path: string;
  setFileList: Dispatch<SetStateAction<GISfile[]>>;
  isUsed?: (folderName: string) => boolean;
}) => {
  const { path, setFileList, isUsed } = { ...props };
  const [dirListing, setDirListing] = useState<fileState[]>([]);

  const router = useRouter();

  //custom type to store states of each file
  type fileState = {
    key: string;
    type: string; //directory or file
    count: number;
    name: string;
    showRename: boolean; //toggle to show/hide rename input field
    newName: string; //used in rename function
  };

  //call api to get the directory listing
  const getDirListing = useCallback(async () => {
    const fileList: GISfile[] | void = await listFiles(path).catch(console.error); //get files
    //convert to type fileState and store in state
    if (fileList) {
      const fileStates: fileState[] = fileList.map((file) => {
        const filetype: string = file.isDir ? "dir" : "file";
        return {
          key: `${filetype}_${file.name}`,
          type: filetype,
          count: file.fileCount,
          name: file.name,
          showRename: false,
          newName: file.name,
        };
      });
      setDirListing(fileStates);
      if (setFileList) setFileList(fileList);
    } else {
      setDirListing([]);
      if (setFileList) setFileList([]);
    }
  }, [path, setFileList]);

  //show or hide the rename field
  function showHideRename(key: string) {
    const newState = [...dirListing];
    const index = newState.findIndex((file) => {
      return file.key === key;
    }); //find this item
    newState[index].showRename = !newState[index].showRename; //toggle value
    setDirListing(newState); //set new state
  }

  //on change handler when a new name is typed in the input field
  function renameChangeHandler(key: string, newName: string) {
    const newState = [...dirListing];
    const index = newState.findIndex((file) => {
      return file.key === key;
    }); //find this item
    newState[index].newName = newName; //toggle value
    setDirListing(newState); //set new state
  }

  //save the new renamed file or folder
  async function saveRename(key: string) {
    const index = dirListing.findIndex((file) => {
      return file.key === key;
    }); //find this item
    const res = await renameFile(path, dirListing[index].name, dirListing[index].newName);
    const message = await res.json();
    if (res.status !== 200) {
      alert(`Rename Error. Status ${res.status}. ${message}`);
    }
    await getDirListing();
  }

  //delete a file
  async function deleteFileToAPI(filename: string): Promise<void> {
    const confirmDelete = confirm("Are you sure you want to delete " + filename);
    if (confirmDelete) {
      const res = await deleteFile(`${path}/${filename}`);
      const message = await res.json();
      if (res.status !== 200) {
        alert(`Delete Error. Status ${res.status}. ${message}`);
      }
      await getDirListing();
    }
    return;
  }

  useEffect(() => {
    (async () => {
      const response = await isLoggedIn(); //check user is logged in
      if (response.status === "success") {
        await getDirListing(); //load directory listing on mount/start
      } else {
        await router.push("/"); //user is not logged in. Redirect to homepage
      }
    })();
  }, [router, getDirListing]);

  return (
    <div>
      <UploadFile path={path} cb={getDirListing} />
      <br />
      <h4>Directory Listing</h4>
      <div>
        {dirListing.length > 0 ? (
          <table className={adminStyles.fileTable}>
            <thead>
              <tr>
                <th>Type</th>
                <th>File Count</th>
                <th>Name</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dirListing.map((file) => {
                return (
                  <tr key={file.key}>
                    <td>{file.type}</td>
                    <td>{file.count}</td>
                    <td>{file.name}</td>
                    <td>
                      {file.showRename ? (
                        <>
                          <input
                            type="text"
                            title="New Name"
                            value={file.newName}
                            onChange={(e) => {
                              renameChangeHandler(file.key, e.target.value);
                            }}
                          />
                          &nbsp;
                          <button
                            onClick={() => {
                              saveRename(file.key);
                            }}
                          >
                            Save
                          </button>
                          &nbsp;
                        </>
                      ) : (
                        <></>
                      )}
                      <button
                        onClick={() => {
                          showHideRename(file.key);
                        }}
                      >
                        {file.showRename ? "Cancel" : "Rename"}
                      </button>
                      &nbsp; &nbsp;
                      <button
                        onClick={() => {
                          deleteFileToAPI(file.name);
                        }}
                        className={adminStyles.deleteButton}
                      >
                        Delete
                      </button>
                      {isUsed ? !isUsed(file.name) && "Not assigned to a layer" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div>No files</div>
        )}
        <br />
        <button onClick={getDirListing}>Refresh</button>
      </div>
    </div>
  );
};

export default FileManager;
