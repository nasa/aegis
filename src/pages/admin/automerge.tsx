import { useNavigate, useParams } from "react-router";
import { useCallback, useEffect, useState } from "react";
import styles from "components/admin/admin.module.css";
import { isLoggedIn } from "http-client/login";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { useDocHandle, useDocument } from "@automerge/automerge-repo-react-hooks";
import { AutomergeUrl, ChangeFn, DocHandleChangePayload } from "@automerge/automerge-repo";
import { applyChange, diff } from "deep-diff";
import Ajv, { ErrorObject } from "ajv";
import { getMissionBackup } from "http-client/mission";

type RouteParams = {
  automergeUrl: string;
};

const ManageAutomergeDoc: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const params = useParams<RouteParams>();
  // Access the automerge mission document via the useDocument hook instead of the
  // useMissionDocSelector (to read) and useDocHandle (to write). This is because for this
  // component, in particular, we access most/all of the properties of mission and it is simpler
  const [automergeMission, changeMissionDoc] = useDocument<Mission>(
    params.automergeUrl as AutomergeUrl
  );
  const [jsonField, setJsonField] = useState("");
  const [importExportStatus, setImportExportStatus] = useState("");
  const missionDocHandle = useDocHandle<Mission>(params.automergeUrl as AutomergeUrl);

  // console log every diff from the automerge doc
  const clgAutomergeDiffs = useCallback((payload: DocHandleChangePayload<Mission>) => {
    console.log(diff(payload.patchInfo.before, payload.patchInfo.after));
  }, []);

  useEffect(() => {
    if (!missionDocHandle) return;
    missionDocHandle.on("change", clgAutomergeDiffs);

    // Cleanup the event listener when the component unmounts or docHandle changes
    return () => {
      missionDocHandle.off("change", clgAutomergeDiffs);
    };
  }, [missionDocHandle, clgAutomergeDiffs]);

  //on load check login and mission id
  useEffect(() => {
    const isLoggedInAsync = async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        if (!(response.data?.isAdmin || response.data?.isSuperAdmin)) {
          navigate("/"); //Redirect to homepage
        }
      } else {
        navigate("/");
      }
    };
    isLoggedInAsync();
  }, [navigate]);

  // grab the schema from the server via an api endpoint and use it to validate
  const validateMission = async (missionToValidate: unknown): Promise<ErrorObject[]> => {
    const schemaRes = await fetch(`/api/v1/mission/schema`);
    if (schemaRes.status !== 200) {
      throw new Error(`Error retrieving schema: ${schemaRes.status}`);
    }
    const schema = (await schemaRes.json()).data;

    const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(missionToValidate);
    if (!valid) {
      return validate.errors || [];
    }
    return [];
  };

  return (
    <>
      <div className={styles.pageStyle}>
        <div className={styles.header}>
          <Header />
        </div>
        <div className={styles.bodyContent}>
          <div className={styles.missionBack}>
            <FontAwesomeIcon
              icon={faArrowAltCircleLeft}
              size="xl"
              onClick={() => {
                navigate("/admin/missions");
              }}
            />
          </div>
          <h1>Manage Automerge Data</h1>
          Manage the Automerge document for the mission.
          <br />
          Database is updated via the auto-backup listener on the server.
          <br />
          Live diffs from the Automerge document for this mission are output to the console.
          <br />
          <br />
          <div style={{ marginBottom: "5px" }}>Mission Name: {automergeMission?.name}</div>
          <div style={{ marginBottom: "5px" }}>AutomergeURL: {params.automergeUrl}</div>
          <div>
            <h2>View Data</h2>
            <div>
              <button
                type="button"
                onClick={() => {
                  console.log(automergeMission);
                }}
              >
                Paste AM doc to console
              </button>
              <br />
              <button
                type="button"
                onClick={async () => {
                  const missionRes = await getMissionBackup(automergeMission?.id);
                  console.log(missionRes);
                }}
              >
                Paste backup DB copy to console
              </button>
            </div>
          </div>
          <div>
            <h2>Validate the Automerge Document</h2>
            <div style={{ marginBottom: "5px" }}>
              Validate the fields in the current Automerge document against the Mission type in the
              codebase. Diffs are output in the dev console (empty array means no diffs). You must
              have already generated a JSON schema.
              <br />
              <button
                onClick={async () => {
                  const results = await validateMission(automergeMission);
                  console.log(results);
                }}
              >
                Compare Now
              </button>
            </div>
          </div>
          <br />
          <div>
            <h2>Export/Import Automerge Document</h2>
            <div style={{ userSelect: "none" }}>
              <button
                onClick={() => {
                  setJsonField(JSON.stringify(automergeMission, null, 2));
                  setImportExportStatus("Export Complete");
                }}
              >
                Export as Automerge Document as JSON to Text Field
              </button>
              &nbsp;
              <button
                disabled={false}
                onClick={async () => {
                  const newVersion: unknown = JSON.parse(jsonField);
                  if (typeof newVersion !== "object" || newVersion === null) {
                    setImportExportStatus("Invalid JSON object");
                    return;
                  }

                  const results = await validateMission(automergeMission);
                  if (results.length > 0) {
                    setImportExportStatus("Invalid mission. See console log for schema errors");
                    console.log(results);
                    return;
                  }

                  // everything looks ok. Set new values in automerge doc with the new version
                  const differences = diff(automergeMission, newVersion);
                  if (differences) {
                    const changeFn: ChangeFn<Mission> = (m: Mission) => {
                      differences.forEach((difference) => {
                        applyChange(m, newVersion, difference);
                      });
                    };
                    changeMissionDoc(changeFn);
                  }
                  setImportExportStatus("Imported new version successfully");
                  setJsonField("");
                }}
              >
                Import JSON in Text Field as a new version to the Automerge Document
              </button>
              <br />
              <div>{importExportStatus}</div>
            </div>
            <div style={{ fontSize: "0.8em" }}>
              <textarea
                style={{ width: "100%", height: "200px" }}
                value={jsonField}
                onChange={(e) => {
                  setJsonField(e.target.value);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ManageAutomergeDoc;
