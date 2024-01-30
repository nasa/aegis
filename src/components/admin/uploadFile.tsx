import { uploadFile } from "http-client/file";
import { ChangeEventHandler, FunctionComponent, useState } from "react";

interface UploadProps {
  path: string; //path off of STATIC_DIR
  subfolder?: string; //optional additional subfolder to nest under the path.
  cb?: (httpStatus: number) => void; //optional callback to execute after an upload has been completed
}

const UploadFile: FunctionComponent<UploadProps> = (props: UploadProps) => {
  const [isSubmitValid, setIsSubmitValid] = useState(false);
  const [isAbortValid, setIsAbortValid] = useState(false);
  const [abort, setAbort] = useState<AbortController>(new AbortController());
  const [selectedFile, setSelectedFile] = useState(null);
  const [isFilePicked, setIsFilePicked] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");

  //handle change when a new file is selected for upload
  const fileChangeHandler: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]); //put into state
      setIsFilePicked(true); //toggle to show file details
      //client side .zip file check. Don't use file type as it is inconsistent at times
      if (event.target.files[0].name.slice(-4).toLowerCase() === ".zip") {
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
  };

  //sends file to be uploaded and sets progress message
  async function uploadFileToAPI() {
    setIsAbortValid(true);

    //add file data and send to the API
    const formData = new FormData();
    formData.append("uploadFile", selectedFile);
    formData.append("path", props.path);
    if (props.subfolder) formData.append("subfolder", props.subfolder);

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

    //if callback was provided, call it.
    if (props.cb) {
      props.cb(res.status);
    }

    setIsAbortValid(false);
  }

  //trigger the abort signal on the file upload
  function abortUpload() {
    abort.abort("User cancelled upload");
    setAbort(new AbortController()); //create new controller to prepare for next upload
  }

  return (
    <>
      Upload File (.zip only)
      <br />
      <input type="file" name="uploadFile" title="Upload File" onChange={fileChangeHandler} />
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
          <p />
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
    </>
  );
};

export default UploadFile;
