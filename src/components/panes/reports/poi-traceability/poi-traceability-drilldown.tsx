import type { FunctionComponent } from "react";
import { useState } from "react";
import styles from "./poi-traceability.module.css";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import ActionPreview, { type ActionPreviewTarget } from "./action-preview";
import TraceIcon from "./trace-icon";

const STATUS_LABEL: Record<PoiTraceActionStatus, string> = {
  complete: "Completed",
  skipped: "Skipped",
  pending: "Pending",
  notIncluded: "Not in this execution",
};

const STATUS_CLASS: Record<PoiTraceActionStatus, string> = {
  complete: styles.complete,
  skipped: styles.skipped,
  pending: styles.pending,
  notIncluded: styles.pending,
};

/** One source action, branching into EVA adoptions and their execution outcomes. */
const PoiTraceabilityDrilldown: FunctionComponent<{ row: PoiTraceRow; mission: Mission }> = ({
  row,
  mission,
}) => {
  const [selectedActionUuid, setSelectedActionUuid] = useState<string | null>(null);
  const [preview, setPreview] = useState<ActionPreviewTarget | null>(null);
  const previewAction = (actionUuid: string, evaUuid?: string, rexUuid?: string) =>
    setPreview({ actionUuid, evaUuid, rexUuid });
  const action =
    row.actions.find((item) => item.poiActionUuid === selectedActionUuid) ?? row.actions[0];
  const branches =
    action?.stationCopies.flatMap((copy) =>
      copy.inScopeEvaUuids.map((evaUuid) => ({ copy, evaUuid }))
    ) ?? [];
  const completed = branches.filter(({ copy, evaUuid }) =>
    copy.executions.some(
      (execution) => execution.evaUuid === evaUuid && execution.status === "complete"
    )
  ).length;

  const evaName = (evaUuid: string) => {
    const eva = mission.evas?.[evaUuid];
    return eva
      ? getAsPlannedEvaFromRefUuid(mission, eva.refUuid)?.name || eva.name || "Unnamed EVA"
      : "Deleted EVA";
  };

  return (
    <section className={styles.lineage} aria-label={`${row.name} action trace`}>
      <header className={styles.lineageHeader}>
        <h2>
          <TraceIcon icon={mission.pois[row.poiUuid]?.icon} />
          {row.name}
        </h2>
        <span className={styles.meta}>POI actions / EVA adoption / execution</span>
      </header>
      {row.actions.length === 0 ? (
        <div className={styles.emptyState}>This POI has no actions to trace.</div>
      ) : (
        <div className={styles.actionWorkspace}>
          <nav className={styles.actionList} aria-label="POI actions">
            <div className={styles.listHeader}>
              Actions <span>{row.actions.length}</span>
            </div>
            {row.actions.map((item) => {
              const adoptions = item.stationCopies.reduce(
                (count, copy) => count + copy.inScopeEvaUuids.length,
                0
              );
              const executions = item.stationCopies.flatMap((copy) => copy.executions);
              const completedCount = executions.filter(
                (execution) => execution.status === "complete"
              ).length;
              return (
                <button
                  type="button"
                  key={item.poiActionUuid}
                  className={`${styles.actionButton} ${item.poiActionUuid === action?.poiActionUuid ? styles.actionSelected : ""}`}
                  aria-pressed={item.poiActionUuid === action?.poiActionUuid}
                  onClick={() => setSelectedActionUuid(item.poiActionUuid)}
                >
                  <span>
                    <TraceIcon icon={mission.actions[item.poiActionUuid]?.icon} />
                    {item.name || "Unnamed action"}
                  </span>
                  <span className={styles.meta}>
                    {adoptions === 0
                      ? "Not adopted"
                      : `${adoptions} adoptions / ${completedCount} completed REX${completedCount === 1 ? "" : "es"}`}
                  </span>
                </button>
              );
            })}
          </nav>
          {action && (
            <div className={styles.tree}>
              <div className={styles.sourceNode}>
                <div className={styles.sourceHeading}>
                  <h3>
                    <TraceIcon icon={mission.actions[action.poiActionUuid]?.icon} />
                    {action.name || "Unnamed action"}
                  </h3>
                  <button
                    type="button"
                    className={styles.actionLink}
                    aria-haspopup="dialog"
                    onClick={() => previewAction(action.poiActionUuid)}
                  >
                    Preview original action
                  </button>
                </div>
                <div className={styles.meta}>
                  {branches.length === 0
                    ? "Not adopted into an EVA in this scope"
                    : `${branches.length} EVA / location adoptions / ${completed} with a completed execution`}
                </div>
              </div>
              {branches.length === 0 ? (
                <div className={styles.noAdoption}>
                  <strong>No adoption in this scope</strong>
                  <p>No station or traverse action in these EVAs traces back to this POI action.</p>
                  <p>Linking a POI to a station alone does not adopt its actions.</p>
                </div>
              ) : (
                <ul className={styles.branches} aria-label="EVA adoptions">
                  {branches.map(({ copy, evaUuid }) => {
                    const executions = copy.executions.filter(
                      (execution) => execution.evaUuid === evaUuid
                    );
                    return (
                      <li className={styles.branch} key={`${copy.stationActionUuid}:${evaUuid}`}>
                        <div className={styles.adoptionNode}>
                          <div className={styles.eyebrow}>Adopted into EVA</div>
                          <div className={styles.sourceHeading}>
                            <h4>{evaName(evaUuid)}</h4>
                            <button
                              type="button"
                              className={styles.actionLink}
                              aria-haspopup="dialog"
                              onClick={() =>
                                previewAction(
                                  copy.stationActionUuid,
                                  evaUuid,
                                  copy.executionOnly ? executions[0]?.rexUuid : undefined
                                )
                              }
                            >
                              Preview adopted action
                            </button>
                          </div>
                          <div className={styles.location}>
                            <span>
                              <TraceIcon icon={copy.stationIcon} />
                              {copy.stationUuid ? "Station" : "Traverse"}:{" "}
                              {copy.stationName ?? copy.traverseName ?? "Unknown location"}
                            </span>
                          </div>
                          {copy.actionName && copy.actionName !== action.name && (
                            <div className={styles.meta}>Action: {copy.actionName}</div>
                          )}
                          {copy.parentCopyDate != null && (
                            <div className={styles.meta}>
                              Adopted {new Date(copy.parentCopyDate).toLocaleDateString()}
                            </div>
                          )}
                          {!copy.enabled && <div className={styles.meta}>Action disabled</div>}
                          {copy.executionOnly && (
                            <div className={styles.meta}>
                              Recorded in execution; no matching adoption in the current plan.
                            </div>
                          )}
                        </div>
                        <div className={styles.outcomeNode}>
                          <div className={styles.eyebrow}>Execution</div>
                          {executions.length === 0 ? (
                            <div className={styles.noExecution}>
                              <strong>No execution recorded</strong>
                            </div>
                          ) : (
                            <ul className={styles.executions} aria-label="Execution outcomes">
                              {executions.map((execution) => (
                                <li key={execution.rexUuid} className={styles.execution}>
                                  <span
                                    className={`${styles.status} ${STATUS_CLASS[execution.status]}`}
                                  >
                                    {STATUS_LABEL[execution.status]}
                                  </span>
                                  <span>{execution.rexName || "Unnamed execution"}</span>
                                  {execution.actionUuid && (
                                    <button
                                      type="button"
                                      className={styles.actionLink}
                                      aria-haspopup="dialog"
                                      onClick={() =>
                                        previewAction(
                                          execution.actionUuid!,
                                          mission.rexes[execution.rexUuid]?.evaUuid,
                                          execution.rexUuid
                                        )
                                      }
                                    >
                                      Preview executed action
                                    </button>
                                  )}
                                  {execution.actionUuid &&
                                    mission.actions[execution.actionUuid]?.name !== action.name && (
                                      <span className={styles.executedName}>
                                        Action:{" "}
                                        {mission.actions[execution.actionUuid]?.name ||
                                          "Unnamed action"}
                                      </span>
                                    )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className={styles.legend}>
                Completed means the action was marked complete in a REX. Pending means it is present
                without a completed or skipped status.
              </p>
            </div>
          )}
        </div>
      )}
      {preview && (
        <ActionPreview mission={mission} target={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
};

export default PoiTraceabilityDrilldown;
