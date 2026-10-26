import type { FunctionComponent } from "react";
import { useTraversePathsContext } from "components/interface/traversePaths/TraversePathsProvider";
import { traversePathOptionColor } from "components/interface/traversePaths/traversePathColors";
import { formatNumberWithCommas } from "utils/formatting";
import { useMissionDocSelector } from "utils/useDocSelector";
import { refEqual } from "utils/useAppSelector";
import {
  groupRowsByHash,
  rowErrorMessage,
  rowMapNames,
  rowStatusLabel,
  rowToCandidate,
  splitRowsForTarget,
} from "utils/traversePath";
import paneStyles from "../global-pane-styles.module.css";
import traverseStyles from "./traverse.module.css";

const PathOptions: FunctionComponent<{ traverseUuid: string }> = ({ traverseUuid }) => {
  const ctx = useTraversePathsContext();
  const planetRadius = useMissionDocSelector((m) => m.planetRadius ?? 1737400, refEqual);

  if (!ctx || ctx.source === "off") return null;

  const target = ctx.targets.find((t) => t.traverseUuid === traverseUuid);
  const { applying, staleCount } = target
    ? splitRowsForTarget(ctx.rowsByRefUuid[target.refUuid], target)
    : { applying: [], staleCount: 0 };
  const groups = groupRowsByHash(applying);

  return (
    <div className={traverseStyles.pathOptions} data-testid="traverse-path-options">
      <div className={traverseStyles.pathOptionsHeader}>
        <span className={paneStyles.displayFieldLabel}>Path Options</span>
        {ctx.source === "mock" && <span className={traverseStyles.pathOptionsMock}>MOCK</span>}
        {ctx.isPolling && <span className={traverseStyles.statusLoading} />}
      </div>

      <div className={traverseStyles.pathOption} data-testid="traverse-path-option-active">
        <span className={traverseStyles.pathOptionSwatchActive} />
        <span className={traverseStyles.pathOptionName}>Current path</span>
        <span className={traverseStyles.pathOptionStatus}>Active</span>
      </div>

      {!target && (
        <div className={traverseStyles.pathOptionNote}>
          Select this traverse&apos;s EVA to see path options.
        </div>
      )}
      {target && groups.length === 0 && (
        <div className={traverseStyles.pathOptionNote}>
          {ctx.isPolling ? "Waiting for path options…" : "No path options for these endpoints."}
        </div>
      )}

      {groups.map((group, index) => {
        const row = group.find((r) => r.status === "succeeded") ?? group[0];
        const candidate = rowToCandidate(row, planetRadius);
        const error = rowErrorMessage(row);
        const slopeMaps = rowMapNames(row, "slope");
        const obstacleMaps = rowMapNames(row, "obstacle");
        const highlighted = ctx.highlightedPathUuid === row.uuid;
        return (
          <div
            key={row.uuid}
            className={`${traverseStyles.pathOption} ${highlighted ? traverseStyles.pathOptionHighlighted : ""}`}
            data-testid="traverse-path-option"
            data-status={row.status}
            onMouseEnter={() => candidate && ctx.setHighlightedPathUuid(row.uuid)}
            onMouseLeave={() => ctx.setHighlightedPathUuid(null)}
          >
            <span
              className={traverseStyles.pathOptionSwatch}
              style={{ borderColor: traversePathOptionColor(index) }}
            />
            <div className={traverseStyles.pathOptionBody}>
              <div className={traverseStyles.pathOptionRow}>
                <span className={traverseStyles.pathOptionName}>
                  {row.label || `Newton ${row.method ?? "A*"}`}
                </span>
                <span className={traverseStyles.pathOptionStatus} data-status={row.status}>
                  {rowStatusLabel(row.status)}
                </span>
              </div>
              {candidate && (
                <div className={traverseStyles.pathOptionDetail}>
                  {formatNumberWithCommas(Math.round(candidate.distanceMeters))} m
                  {row.runtimeMs != null && <> · planned in {Math.round(row.runtimeMs / 1000)} s</>}
                </div>
              )}
              {(slopeMaps.length > 0 || obstacleMaps.length > 0) && (
                <div className={traverseStyles.pathOptionDetail}>
                  {slopeMaps.length > 0 && <>Slope: {slopeMaps.join(", ")}</>}
                  {obstacleMaps.length > 0 && <> · Obstacles: {obstacleMaps.join(", ")}</>}
                </div>
              )}
              {error && (
                <div className={traverseStyles.pathOptionError} data-testid="traverse-path-error">
                  {error}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {staleCount > 0 && (
        <div className={traverseStyles.pathOptionNote}>
          {staleCount} option{staleCount === 1 ? "" : "s"} hidden: planned for earlier endpoints.
        </div>
      )}
      {ctx.fetchError && (
        <div className={traverseStyles.pathOptionError}>
          Could not load path options: {ctx.fetchError}
        </div>
      )}
    </div>
  );
};

export default PathOptions;
