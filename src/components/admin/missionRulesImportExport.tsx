import { useState, type ReactElement } from "react";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { applyImportStmRules, exportStmRules, parseStmRules } from "utils/stmRulesImportExport";
import AsyncStatus from "./asyncStatus";
import { useAsyncStatus } from "./useAsyncStatus";
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
  const [message, setMessage] = useState("");
  const action = useAsyncStatus();
  const disabled = !mission || !!action.pending;
  const count = Object.keys(mission?.stmRules ?? {}).length;

  const runImport = () => {
    if (disabled) return;
    setMessage("");
    action.run("Importing mission rules...", async () => {
      // Let the browser paint the status before parsing and updating the document.
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
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
    });
  };

  const runExport = () => {
    if (disabled) return;
    setMessage("");
    action.run("Exporting mission rules...", async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const url = URL.createObjectURL(
        new Blob([exportStmRules(mission)], { type: "application/json" })
      );
      const link = document.createElement("a");
      try {
        link.href = url;
        link.download = `mission-${mission.id}-rules.json`;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
    });
  };

  return (
    <div className={adminStyles.sectionDiv}>
      <div className={adminStyles.sectionDivHeading}>Import/Export Mission Rules</div>
      <AsyncStatus
        pending={action.pending || (!mission ? "Loading mission rules..." : null)}
        error={action.error}
      />
      <div className={styles.exportContainer}>
        <button
          type="button"
          className={adminCommon.button}
          disabled={disabled}
          onClick={runExport}
        >
          Export Mission Rules to JSON
        </button>
        {mission && <span className={styles.hint}>{count} rules</span>}
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
              disabled={disabled}
              onChange={(event) => {
                if (disabled) return;
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setMessage("");
                setJson("");
                action.run("Reading mission rules file...", async () => {
                  setJson(await file.text());
                });
              }}
            />
          </label>
          <div>
            <textarea
              aria-label="Mission rules JSON"
              placeholder="Paste exported mission rules JSON here"
              className={styles.importTextArea}
              disabled={disabled}
              value={json}
              onChange={(event) => {
                setJson(event.target.value);
                action.clearError();
                setMessage("");
              }}
            />
          </div>
          <button
            type="button"
            className={adminCommon.button}
            disabled={disabled || !json.trim()}
            onClick={runImport}
          >
            Import Mission Rules
          </button>
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
