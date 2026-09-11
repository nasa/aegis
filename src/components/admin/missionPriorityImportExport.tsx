import type { FunctionComponent } from "react";
import { useState } from "react";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import adminStyles from "./admin.module.css";
import adminCommon from "pages/admin/adminCommon.module.css";
import priorityStyles from "./missionPriorityImportExport.module.css";
import { deepEqual } from "utils/useAppSelector";
import { useDocSelector } from "utils/useDocSelector";
import { applyReplaceAllMissionPriorities } from "operations/apply/apply-mission-priority";
import { getMissionPriorityUsages } from "operations/helpers/missionPriorityUsages";

/**
 * One category and every trace it contains, as used by the admin bulk import/export tool.
 * Grouping by category keeps the JSON compact and mirrors how the UI presents the rows.
 */
export type MissionPriorityImportCategory = {
  category: string;
  traces: string[];
};

/** Shape of the JSON document consumed and produced by this tool. */
type MissionPriorityImportFile = {
  missionPriorities: MissionPriorityImportCategory[];
};

const EXAMPLE_JSON = `{
  "missionPriorities": [
    {
      "category": "Sample Collection",
      "traces": ["SIMD-0002", "SIMD-0002.1", "SIMD-0010"]
    },
    {
      "category": "Instrument Deployment",
      "traces": ["SIMD-0031"]
    }
  ]
}`;

/**
 * Validate parsed JSON against the import format and normalize it.
 * Returns either the cleaned categories or a human-readable error message.
 */
const parseImportJson = (
  json: string
): { categories: MissionPriorityImportCategory[] } | { error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { error: `Invalid JSON: ${(e as Error).message}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: 'Top level of the JSON must be an object with a "missionPriorities" key.' };
  }

  const rawCategories = (parsed as MissionPriorityImportFile).missionPriorities;
  if (!Array.isArray(rawCategories)) {
    return { error: '"missionPriorities" must be an array of category objects.' };
  }

  const categories: MissionPriorityImportCategory[] = [];
  const seenCategories = new Set<string>();

  for (const [index, rawCategory] of rawCategories.entries()) {
    if (typeof rawCategory !== "object" || rawCategory === null || Array.isArray(rawCategory)) {
      return { error: `Entry ${index + 1} must be an object with "category" and "traces".` };
    }

    const category = (rawCategory as MissionPriorityImportCategory).category;
    if (typeof category !== "string" || category.trim() === "") {
      return { error: `Entry ${index + 1} is missing a non-empty "category" string.` };
    }

    const normalizedCategory = category.trim();
    const categoryKey = normalizedCategory.toLocaleLowerCase();
    if (seenCategories.has(categoryKey)) {
      return { error: `Duplicate category "${normalizedCategory}".` };
    }
    seenCategories.add(categoryKey);

    const rawTraces = (rawCategory as MissionPriorityImportCategory).traces;
    if (!Array.isArray(rawTraces) || rawTraces.length === 0) {
      return {
        error: `Category "${normalizedCategory}" must have a "traces" array with at least one trace.`,
      };
    }

    const traces: string[] = [];
    const seenTraces = new Set<string>();
    for (const rawTrace of rawTraces) {
      if (typeof rawTrace !== "string" || rawTrace.trim() === "") {
        return { error: `Category "${normalizedCategory}" contains an empty or non-string trace.` };
      }
      const trace = rawTrace.trim();
      if (trace.length > 255) {
        return { error: `Trace "${trace}" in "${normalizedCategory}" exceeds 255 characters.` };
      }
      const traceKey = trace.toLocaleLowerCase();
      if (seenTraces.has(traceKey)) {
        return { error: `Duplicate trace "${trace}" in category "${normalizedCategory}".` };
      }
      seenTraces.add(traceKey);
      traces.push(trace);
    }

    categories.push({ category: normalizedCategory, traces });
  }

  return { categories };
};

/**
 * Admin tool for bulk import/export of a mission's priority identifiers. The regular
 * per-row editor lives in the mission right pane; this replaces the whole set at once.
 */
const MissionPriorityImportExport: FunctionComponent<{
  automergeUrl: AutomergeUrl;
}> = ({ automergeUrl }) => {
  return (
    <div className={adminStyles.sectionDiv}>
      <div className={adminStyles.sectionDivHeading}>
        Import/Export Mission Priority Identifiers
      </div>
      <ExportMissionPriorities automergeUrl={automergeUrl} />
      <div className={priorityStyles.importExport}>
        <ImportMissionPriorities automergeUrl={automergeUrl} />
      </div>
    </div>
  );
};

export default MissionPriorityImportExport;

const ExportMissionPriorities: FunctionComponent<{
  automergeUrl: AutomergeUrl;
}> = ({ automergeUrl }) => {
  const categories = useDocSelector<Mission, MissionPriorityImportCategory[]>(
    automergeUrl,
    (doc) => {
      // Group the mission's priority rows into the category/traces shape used by this tool.
      // Categories and traces are sorted so exports are stable; numeric collation keeps
      // SIMD-0002 ahead of SIMD-0010.
      const categorySet = new Set<string>();
      for (const missionPriority of Object.values(doc.missionPriorities ?? {})) {
        categorySet.add(missionPriority.category);
      }
      return [...categorySet]
        .sort((a, b) => a.localeCompare(b))
        .map((category) => ({
          category,
          traces: Object.values(doc.missionPriorities ?? {})
            .filter((missionPriority) => missionPriority.category === category)
            .map((missionPriority) => missionPriority.trace)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        }));
    },
    deepEqual
  );

  const traceCount = (categories ?? []).reduce((sum, entry) => sum + entry.traces.length, 0);

  const exportMissionPriorities = () => {
    const file: MissionPriorityImportFile = { missionPriorities: categories ?? [] };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "missionPriorityIdentifiers.json";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={priorityStyles.exportContainer}>
      <button
        onClick={exportMissionPriorities}
        className={adminCommon.button}
        disabled={traceCount === 0}
      >
        Export Mission Priority Identifiers to JSON
      </button>
      <span className={priorityStyles.hint}>
        {(categories ?? []).length} categor{(categories ?? []).length === 1 ? "y" : "ies"},{" "}
        {traceCount} trace{traceCount === 1 ? "" : "s"}
      </span>
    </div>
  );
};

const ImportMissionPriorities: FunctionComponent<{
  automergeUrl: AutomergeUrl;
}> = ({ automergeUrl }) => {
  const missionPriorityDocHandle = useDocHandle<Mission>(automergeUrl);
  const [importJson, setImportJson] = useState<string>("");
  const [error, setError] = useState<string>("");

  const runImport = () => {
    setError("");

    const result = parseImportJson(importJson);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    const mission = missionPriorityDocHandle?.doc();
    if (!mission) {
      setError("Mission document is not available.");
      return;
    }

    // Importing discards every existing row, so warn about any action or action template
    // whose mission priority reference will be cleared.
    const existingUuids = new Set(Object.keys(mission.missionPriorities ?? {}));
    const usages = getMissionPriorityUsages(mission, existingUuids);
    const usageWarning =
      usages.length > 0
        ? `\n\n${usages.length} action(s)/template(s) currently reference an existing identifier and will have it cleared.`
        : "";

    if (
      !confirm(
        "Are you sure you want to import? This will delete all existing mission priority identifiers for this mission." +
          usageWarning
      )
    ) {
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    missionPriorityDocHandle.change((m: Mission) =>
      applyReplaceAllMissionPriorities(m, { categories: result.categories })
    );
    setImportJson("");
  };

  return (
    <div>
      <textarea
        id="importMissionPriorities"
        aria-label="Mission priority identifiers JSON"
        placeholder="paste mission priority identifier json to import here"
        value={importJson}
        onChange={(e) => setImportJson(e.target.value)}
        className={priorityStyles.importTextArea}
      />
      &nbsp;
      <button
        onClick={runImport}
        className={adminCommon.button}
        disabled={importJson.trim() === ""}
      >
        Import Mission Priority Identifiers
      </button>
      {error && <div className={priorityStyles.error}>{error}</div>}
      <div className={priorityStyles.hint}>Expected format:</div>
      <pre className={priorityStyles.formatBlock}>{EXAMPLE_JSON}</pre>
    </div>
  );
};
