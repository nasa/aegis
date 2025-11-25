import isNull from "lodash/isNull";
import { uploadFile } from "http-client/file";
import prettyBytes from "pretty-bytes";
import { ChangeEventHandler, FunctionComponent, useState } from "react";

interface UploadProps {
  path: string; //path off of STATIC_DIR
  subfolder?: string; //optional additional subfolder to nest under the path.
  cb?: (httpStatus: number) => void; //optional callback to execute after an upload has been completed
  /** only allow uploading zip files. if false, any file type upload is allowed */
  zipOnly: boolean;
}

/** at what stage are we in the upload process */
enum UploadStatus {
  /** no file has been selected for upload */
  Pending = "pending",
  /** there's some reason we cannot upload the currently selected file */
  Blocked = "blocked",
  /** we can upload the currently selected file */
  Ready = "ready",
  /** the file is in the process of uploading */
  Uploading = "uploading",
  /** the file has successfully been received by the server */
  Success = "success",
  /** the server responding with a non-200s error code */
  Error = "error",
}

const UploadFile: FunctionComponent<UploadProps> = (props: UploadProps) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileExtension, setFileExtension] = useState("");
  const [status, setStatus] = useState<UploadStatus>(UploadStatus.Pending);
  const [abort, setAbort] = useState<AbortController>(new AbortController());
  const [progressMsg, setProgressMsg] = useState("");

  //handle change when a new file is selected for upload
  const fileChangeHandler: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.target.files.length > 0) {
      const theFile = event.target.files[0];
      setSelectedFile(theFile); //put into state

      const dotIndex = theFile.name.lastIndexOf(".");
      const extension = dotIndex > -1 ? theFile.name.slice(dotIndex) : "";
      setFileExtension(extension);

      const hasCorrectExtension = (props.zipOnly && extension === ".zip") || !props.zipOnly;
      if (hasCorrectExtension) {
        setStatus(UploadStatus.Ready);
      } else {
        setStatus(UploadStatus.Blocked);
      }
    } else {
      setSelectedFile(null);
      setStatus(UploadStatus.Pending);
      setFileExtension("");
    }
    setProgressMsg(""); //clear message
  };

  //sends file to be uploaded and sets progress message
  async function uploadFileToAPI() {
    setStatus(UploadStatus.Uploading);

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

    if (res.status >= 200 && res.status <= 299) {
      setProgressMsg(`Upload success. Status ${res.status}. ${message}`);
      setStatus(UploadStatus.Success);
    } else {
      setProgressMsg(`Upload Error. Status ${res.status}. ${message}`);
      setStatus(UploadStatus.Error);
    }

    //if callback was provided, call it.
    if (props.cb) {
      props.cb(res.status);
    }
  }

  //trigger the abort signal on the file upload
  function abortUpload() {
    abort.abort("User cancelled upload");
    setAbort(new AbortController()); //create new controller to prepare for next upload
  }

  /** If the filetype is valid, just render it. If invalid, inform users we cannot upload the wrong filetype
   * @param filetype string
   * @returns JSX.Element
   */
  function renderFiletype(filetype: string) {
    if (!props.zipOnly) {
      return <>{filetype}</>;
    }

    // we must be expecting a zip file

    if (fileExtension === ".zip") {
      return <>{filetype}</>;
    }

    return (
      <span style={{ color: "red" }} title="Only .zip supported">
        <strong>{filetype}</strong>
      </span>
    );
  }

  return (
    <>
      Upload File{props.zipOnly && " (.zip only)"}
      <br />
      <input
        type="file"
        name="uploadFile"
        title="Upload File"
        onChange={fileChangeHandler}
        accept={props.zipOnly ? ".zip,application/zip" : ""}
      />
      <div style={{ marginLeft: 20 }}>
        {!isNull(selectedFile) ? (
          <p>
            Filename: {selectedFile.name}
            <br />
            Filetype: {renderFiletype(selectedFile.type)}
            <br />
            File size: {prettyBytes(selectedFile.size)}
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
        <button onClick={uploadFileToAPI} disabled={status !== UploadStatus.Ready}>
          Submit
        </button>
        &nbsp;
        <button onClick={abortUpload} disabled={status !== UploadStatus.Uploading}>
          Abort Upload
        </button>
        {status === UploadStatus.Blocked ? (
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
