import { Link, useNavigate, useParams } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { isLoggedIn } from "http-client/login";
import { useDocHandle, useDocument } from "@automerge/automerge-repo-react-hooks";
import type { AutomergeUrl, ChangeFn, DocHandleChangePayload } from "@automerge/automerge-repo";
import { applyChange, diff } from "deep-diff";
import type { ErrorObject } from "ajv";
import Ajv from "ajv";
import adminCommon from "./adminCommon.module.css";

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
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Manage Automerge Data</h1>
        {automergeMission?.name && (
          <div className={adminCommon.missionSubheader}>
            <span className={adminCommon.missionSubheaderLabel}>Mission</span>
            <span className={adminCommon.missionSubheaderName}>{automergeMission.name}</span>
          </div>
        )}
        <p className={adminCommon.descriptionText}>
          Manage the Automerge document for the mission. Database is updated via the auto-backup
          listener on the server. Live diffs from the Automerge document for this mission are output
          to the console.
        </p>

        <section className={adminCommon.section}>
          <h2>Document Info</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.definitionList}>
              <div className={adminCommon.definitionRow}>
                <dt>Mission Name</dt>
                <dd>{automergeMission?.name}</dd>
              </div>
              <div className={adminCommon.definitionRow}>
                <dt>Automerge URL</dt>
                <dd style={{ fontFamily: "var(--font-mono)" }}>{params.automergeUrl}</dd>
              </div>
            </div>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2>View Data</h2>
          <div className={adminCommon.details}>
            <p className={adminCommon.descriptionText}>
              Output document data to the browser developer console.
            </p>
            <div className={adminCommon.formActions}>
              <button
                className={adminCommon.button}
                type="button"
                onClick={() => {
                  console.log(automergeMission);
                }}
              >
                Paste AM Doc to Console
              </button>
            </div>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2>Validate</h2>
          <div className={adminCommon.details}>
            <p className={adminCommon.descriptionText}>
              Validate the fields in the current Automerge document against the Mission type in the
              codebase. Diffs are output in the dev console (empty array means no diffs). You must
              have already generated a JSON schema.
            </p>
            <div className={adminCommon.formActions}>
              <button
                className={adminCommon.button}
                onClick={async () => {
                  const results = await validateMission(automergeMission);
                  console.log(results);
                }}
              >
                Compare Now
              </button>
            </div>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2>Export / Import</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.formActions}>
              <button
                className={adminCommon.button}
                onClick={() => {
                  setJsonField(JSON.stringify(automergeMission, null, 2));
                  setImportExportStatus("Export Complete");
                }}
              >
                Export Automerge Document as JSON
              </button>
              <button
                className={adminCommon.buttonDanger}
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
                Import JSON as New Version
              </button>
            </div>
            {importExportStatus && (
              <p className={adminCommon.statusMessage}>{importExportStatus}</p>
            )}
            <textarea
              className={adminCommon.logTextarea}
              value={jsonField}
              onChange={(e) => {
                setJsonField(e.target.value);
              }}
            />
          </div>
        </section>
      </div>
    </main>
  );
};

export default ManageAutomergeDoc;
