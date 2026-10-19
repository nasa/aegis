import { useState, type ReactElement } from "react";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { applyImportStmRules, exportStmRules, parseStmRules } from "utils/stmRulesImportExport";
import adminStyles from "./admin.module.css";
import adminCommon from "pages/admin/adminCommon.module.css";
import styles from "./missionPriorityImportExport.module.css";

export default function MissionRulesImportExport({
  automergeUrl,
}: {
  automergeUrl: AutomergeUrl;
}): ReactElement {
  const [mission, changeMission] = useDocument<Mission>(automergeUrl);
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const count = Object.keys(mission?.stmRules ?? {}).length;

  const runImport = () => {
    setError("");
    setMessage("");
    if (!mission) return;
    try {
      const rules = parseStmRules(json, mission);
      if (
        !confirm(
          `Replace all ${count} mission rules with ${rules.length} imported rules? Export a backup first if you want to keep the current rules.`
        )
      )
        return;
      // This admin page writes to its own mission document, not the active mission.
      changeMission((doc) => {
        applyImportStmRules(doc, json);
      });
      setMessage(`Imported ${rules.length} mission rules.`);
      setJson("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import mission rules.");
    }
  };

  return (
    <div className={adminStyles.sectionDiv}>
      <div className={adminStyles.sectionDivHeading}>Import/Export Mission Rules</div>
      <div className={styles.exportContainer}>
        <button
          type="button"
          className={adminCommon.button}
          disabled={!mission}
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportStmRules(mission)], { type: "application/json" })
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `mission-${mission.id}-rules.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
          }}
        >
          Export Mission Rules to JSON
        </button>
        <span className={styles.hint}>{count} rules</span>
      </div>
      <p className={styles.hint}>
        Import replaces all mission rules. STM entries and action definitions must already exist
        with matching IDs in the destination mission.
      </p>
      <div className={styles.importExport}>
        <div>
          <label>
            Load mission rules JSON{" "}
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                setError("");
                setMessage("");
                if (!file) return;
                try {
                  setJson(await file.text());
                } catch {
                  setJson("");
                  setError("Unable to read the selected file.");
                }
              }}
            />
          </label>
          <div>
            <textarea
              aria-label="Mission rules JSON"
              placeholder="Paste exported mission rules JSON here"
              className={styles.importTextArea}
              value={json}
              onChange={(event) => {
                setJson(event.target.value);
                setError("");
                setMessage("");
              }}
            />
          </div>
          <button
            type="button"
            className={adminCommon.button}
            disabled={!mission || !json.trim()}
            onClick={runImport}
          >
            Import Mission Rules
          </button>
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
          {message && (
            <div role="status" className={styles.hint}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
