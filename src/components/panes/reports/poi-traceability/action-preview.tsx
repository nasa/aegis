import type { FunctionComponent } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import TraceIcon from "./trace-icon";
import RightAction from "components/panes/actions-action";
import styles from "./poi-traceability.module.css";

export type ActionPreviewTarget = {
  actionUuid: string;
  evaUuid?: string;
  rexUuid?: string;
};

const REX_STATUS: Record<RexStatus, string> = {
  complete: "Completed",
  skipped: "Skipped",
  "in-progress": "In progress",
  pending: "Pending",
};

/** Modal shell for RightAction, with expansion local to the preview. */
const ActionPreview: FunctionComponent<{
  mission: Mission;
  target: ActionPreviewTarget;
  onClose: () => void;
}> = ({ mission, target, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [expanded, setExpanded] = useState(true);
  useLayoutEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const action = mission.actions[target.actionUuid];
  const rex = target.rexUuid
    ? mission.rexes[target.rexUuid]
    : Object.values(mission.rexes).find((item) => item.evaUuid === target.evaUuid);
  const eva = mission.evas[rex?.evaUuid ?? target.evaUuid ?? ""];
  const evaName = eva
    ? getAsPlannedEvaFromRefUuid(mission, eva.refUuid)?.name || eva.name || "Unnamed EVA"
    : null;
  const entry = rex?.actionEntries?.[target.actionUuid];
  const kind = action?.poiUuid ? "Original POI action" : rex ? "Executed action" : "Adopted action";
  const parentType: ActionParentType = action?.poiUuid
    ? "poi"
    : action?.stationUuid
      ? "station"
      : "traverse";
  const parent = action?.poiUuid
    ? mission.pois[action.poiUuid]
    : action?.stationUuid
      ? mission.stations[action.stationUuid]
      : null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.previewDialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className={styles.previewContent}>
        <header className={styles.previewHeader}>
          <div>
            <div className={styles.meta}>{kind} / Read-only preview</div>
            <h2 id={titleId}>Action preview</h2>
          </div>
          <button
            type="button"
            className={styles.previewClose}
            onClick={() => dialogRef.current?.close()}
          >
            Close preview
          </button>
        </header>
        {!action ? (
          <p>This action is no longer available.</p>
        ) : (
          <div className={styles.previewBody}>
            <div className={styles.previewContext}>
              {action.poiUuid && (
                <div>
                  <TraceIcon icon={mission.pois[action.poiUuid]?.icon} />
                  POI: {mission.pois[action.poiUuid]?.name ?? "Deleted POI"}
                </div>
              )}
              {evaName && <div>EVA: {evaName}</div>}
              {action.stationUuid && (
                <div>
                  <TraceIcon icon={mission.stations[action.stationUuid]?.icon} />
                  Station: {mission.stations[action.stationUuid]?.name ?? "Deleted station"}
                </div>
              )}
              {action.traverseUuid && (
                <div>
                  Traverse: {mission.traverses[action.traverseUuid]?.name ?? "Deleted traverse"}
                </div>
              )}
              {rex && (
                <div>
                  REX: {rex.name || "Unnamed execution"} /{" "}
                  {REX_STATUS[entry?.rexStatus ?? "pending"]}
                </div>
              )}
            </div>
            <div className={styles.previewAction}>
              <RightAction
                actionUuid={target.actionUuid}
                editMode={false}
                allowEdit={false}
                highlight={false}
                parentType={parentType}
                parentLocation={parent?.location ?? null}
                parentElevation={parent?.elevation ?? null}
                rexUuid={rex?.uuid ?? null}
                toFocus={false}
                expanded={expanded}
                onExpandedChange={setExpanded}
              />
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};

export default ActionPreview;
