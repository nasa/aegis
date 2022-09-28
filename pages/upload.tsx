import { NextPage } from "next";
import { useEffect, useState } from "react";
import { uploadFile, listFiles, deleteFile, renameFile } from "http-client/upload";
import { useRouter } from "next/router";
import { isLoggedIn } from "http-client/internal-api";

//export default withIronSessionApiRoute(Upload, ironOptions);

const Upload: NextPage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isFilePicked, setIsFilePicked] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [dirListing, setDirListing] = useState<fileState[]>([]);
  const [isSubmitValid, setIsSubmitValid] = useState(false);
  const [isAbortValid, setIsAbortValid] = useState(false);
  const [abort, setAbort] = useState<AbortController>(new AbortController());
  const router = useRouter();

  //custom type to store states of each file
  type fileState = {
    key: string;
    type: string; //directory or file
    name: string;
    showRename: boolean; //toggle to show/hide rename input field
    newName: string; //used in rename function
  };

  //call api to get the directory listing
  async function getDirListing() {
    const getListFiles = async () => {
      const fileList: GISfile[] = await listFiles(); //get files
      //convert to type fileState and store in state
      const fileStates: fileState[] = fileList.map((file) => {
        const filetype: string = file.isDir ? "dir" : "file";
        return {
          key: `${filetype}_${file.name}`,
          type: filetype,
          name: file.name,
          showRename: false,
          newName: file.name,
        };
      });
      setDirListing(fileStates);
    };
    getListFiles().catch(console.error);
  }

  //handle change when a new file is selected for upload
  function fileChangeHandler(event) {
    if (event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]); //put into state
      setIsFilePicked(true); //toggle to show file details
      //client side .zip file check
      if (event.target.files[0].type === "application/x-zip-compressed") {
        setIsSubmitValid(true);
      } else {
        setIsSubmitValid(false);
      }
    } else {
      setSelectedFile(null);
      setIsFilePicked(false);
      setIsSubmitValid(false);
    }
    setProgressMsg(""); //clear message
  }

  //sends file to be uploaded and sets progress message
  async function uploadFileToAPI() {
    setIsAbortValid(true);

    //add file data and send to the API
    const formData = new FormData();
    formData.append("uploadFile", selectedFile);

    //call upload func
    const res = await uploadFile(formData, abort, (event) => {
      const progress = Math.round((event.loaded * 100) / event.total);
      if (progress < 100) {
        setProgressMsg(`Upload progress: ${progress} %`);
      } else {
        setProgressMsg("File received! Extracting...");
      }
    });

    //update response
    const message = res.data;
    setProgressMsg(
      `Upload ${res.status === 200 ? "Success" : "Error"}. Status ${res.status}. ${message}`
    );

    getDirListing(); //refresh dir listing
    setIsAbortValid(false);
  }

  //trigger the abort signal on the file upload
  function abortUpload() {
    abort.abort("User cancelled upload");
    setAbort(new AbortController()); //create new controller to prepare for next upload
    setTimeout(getDirListing, 1000); //wait after timeout to refresh. Sever takes a bit to delete partial file
  }

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
    const res = await renameFile(dirListing[index].name, dirListing[index].newName);
    const message = await res.json();
    setProgressMsg(
      `Rename ${res.status === 200 ? "Success" : "Error"}. Status ${res.status}. ${message}`
    );
    getDirListing();
  }

  //delete a file
  async function deleteFileToAPI(filename: string) {
    const confirmDelete = confirm("Are you sure you want to delete " + filename);
    if (confirmDelete) {
      const res = await deleteFile(filename);
      const message = await res.json();
      setProgressMsg(
        `Delete ${res.status === 200 ? "Success" : "Error"}. Status ${res.status}. ${message}`
      );
      getDirListing();
    }
  }

  useEffect(() => {
    (async () => {
      const response = await isLoggedIn(); //check user is logged in
      if (response.status === "success") {
        getDirListing(); //load directory listing on mount/start
      } else {
        router.push("/"); //user is not logged in. Redirect to homepage
      }
    })();
  }, []);

  return (
    <div>
      <h3>Upload a Zip file</h3>
      <input type="file" name="uploadFile" onChange={fileChangeHandler} />
      <div style={{ marginLeft: 20 }}>
        {isFilePicked ? (
          <p>
            Filename: {selectedFile.name}
            <br />
            Filetype: {selectedFile.type}
            <br />
            Size in bytes: {selectedFile.size}
            <br />
            Last modified date:{" "}
            {
              selectedFile.lastModifiedDate
                ? selectedFile.lastModifiedDate.toLocaleDateString()
                : "Not Available" //some browsers don't have this data (Firefox, Safari)
            }
            <br />
          </p>
        ) : (
          <p>Select a file</p>
        )}
      </div>
      <div>
        <button onClick={uploadFileToAPI} disabled={!isSubmitValid}>
          Submit
        </button>
        &nbsp;
        <button onClick={abortUpload} disabled={!isAbortValid}>
          Abort Upload
        </button>
        {!isSubmitValid && isFilePicked ? (
          <>
            <br />
            Please select a valid file
          </>
        ) : (
          ""
        )}
      </div>
      {progressMsg}
      <br />
      <h3>Directory Listing</h3>
      <div>
        {dirListing.length > 0 ? (
          dirListing.map((file) => {
            return (
              <div key={file.key}>
                {file.type} {file.name}&nbsp;
                {file.showRename ? (
                  <>
                    <input
                      type="text"
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
                >
                  Delete
                </button>
              </div>
            );
          })
        ) : (
          <div>No files</div>
        )}
        <br />
        <button onClick={getDirListing}>Refresh</button>
      </div>
    </div>
  );
};

export default Upload;
