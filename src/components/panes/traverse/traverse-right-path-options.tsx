import type { FunctionComponent, KeyboardEvent, ReactNode } from "react";
import { useTraversePathsContext } from "components/interface/traversePaths/TraversePathsProvider";
import {
  MANUAL_PATH_COLOR,
  traversePathOptionColor,
} from "components/interface/traversePaths/traversePathColors";
import { formatNumberWithCommas } from "utils/formatting";
import { useMissionDocSelector } from "utils/useDocSelector";
import { refEqual } from "utils/useAppSelector";
import {
  groupRowsByHash,
  manualCandidateId,
  pathLengthMeters,
  rowErrorMessage,
  rowMapNames,
  rowStatusLabel,
  rowToCandidate,
  splitRowsForTarget,
} from "utils/traversePath";
import paneStyles from "../global-pane-styles.module.css";
import traverseStyles from "./traverse.module.css";

type OptionRowProps = {
  testId: string;
  status?: string;
  active: boolean;
  highlighted: boolean;
  selectable: boolean;
  swatchColor: string;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  children: ReactNode;
};

const OptionRow: FunctionComponent<OptionRowProps> = ({
  testId,
  status,
  active,
  highlighted,
  selectable,
  swatchColor,
  onSelect,
  onHover,
  children,
}) => {
  const classes = [
    traverseStyles.pathOption,
    selectable && !active ? traverseStyles.pathOptionSelectable : "",
    active ? traverseStyles.pathOptionActive : "",
    highlighted ? traverseStyles.pathOptionHighlighted : "",
  ].join(" ");
  const canSelect = selectable && !active;
  const handleKey = (e: KeyboardEvent) => {
    if (canSelect && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onSelect();
    }
  };
  return (
    <div
      className={classes}
      data-testid={testId}
      data-status={status}
      data-active={active ? "true" : "false"}
      role={canSelect ? "button" : undefined}
      tabIndex={canSelect ? 0 : undefined}
      aria-pressed={selectable ? active : undefined}
      onClick={canSelect ? onSelect : undefined}
      onKeyDown={handleKey}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <span
        className={active ? traverseStyles.pathOptionSwatchActive : traverseStyles.pathOptionSwatch}
        style={active ? undefined : { borderColor: swatchColor }}
      />
      <div className={traverseStyles.pathOptionBody}>{children}</div>
    </div>
  );
};

const PathOptions: FunctionComponent<{ traverseUuid: string }> = ({ traverseUuid }) => {
  const ctx = useTraversePathsContext();
  const planetRadius = useMissionDocSelector((m) => m.planetRadius ?? 1737400, refEqual);
  const docPathLength = useMissionDocSelector((m) => {
    const path = m.traverses?.[traverseUuid]?.path;
    return path && path.length >= 2 ? pathLengthMeters(path, m.planetRadius ?? 1737400) : null;
  }, refEqual);

  if (!ctx || ctx.source === "off") return null;

  const target = ctx.targets.find((t) => t.traverseUuid === traverseUuid);
  const { applying, staleCount } = target
    ? splitRowsForTarget(ctx.rowsByRefUuid[target.refUuid], target)
    : { applying: [], staleCount: 0 };
  const groups = groupRowsByHash(applying);
  const preview = ctx.previewByTraverseUuid[traverseUuid];
  const activeRowUuid = preview?.rowUuid ?? null;
  const manualId = manualCandidateId(traverseUuid);

  const select = (rowUuid: string | null) => {
    ctx.setActivePath(traverseUuid, rowUuid);
    ctx.setHighlightedPathUuid(null);
  };
  const hover = (id: string, canHighlight: boolean) => (hovered: boolean) =>
    ctx.setHighlightedPathUuid(hovered && canHighlight ? id : null);

  return (
    <div className={traverseStyles.pathOptions} data-testid="traverse-path-options">
      <div className={traverseStyles.pathOptionsHeader}>
        <span className={paneStyles.displayFieldLabel}>Path Options</span>
        {ctx.source === "mock" && <span className={traverseStyles.pathOptionsMock}>MOCK</span>}
        {ctx.isPolling && <span className={traverseStyles.statusLoading} />}
      </div>

      {preview && (
        <div className={traverseStyles.pathOptionPreview} data-testid="traverse-path-preview-note">
          Previewing a Newton path. Not saved; other users still see the current path.
        </div>
      )}

      <OptionRow
        testId="traverse-path-option-current"
        active={!activeRowUuid}
        highlighted={ctx.highlightedPathUuid === manualId}
        selectable={!!activeRowUuid}
        swatchColor={MANUAL_PATH_COLOR}
        onSelect={() => select(null)}
        onHover={hover(manualId, !!activeRowUuid)}
      >
        <div className={traverseStyles.pathOptionRow}>
          <span className={traverseStyles.pathOptionName}>Current path</span>
          <span className={traverseStyles.pathOptionStatus}>{activeRowUuid ? "" : "Active"}</span>
        </div>
        {docPathLength != null && (
          <div className={traverseStyles.pathOptionDetail}>
            {formatNumberWithCommas(Math.round(docPathLength))} m
          </div>
        )}
      </OptionRow>

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
        const active = group.some((r) => r.uuid === activeRowUuid);
        return (
          <OptionRow
            key={row.uuid}
            testId="traverse-path-option"
            status={row.status}
            active={active}
            highlighted={ctx.highlightedPathUuid === row.uuid}
            selectable={!!candidate}
            swatchColor={traversePathOptionColor(index)}
            onSelect={() => select(row.uuid)}
            onHover={hover(row.uuid, !!candidate && !active)}
          >
            <div className={traverseStyles.pathOptionRow}>
              <span className={traverseStyles.pathOptionName}>
                {row.label || `Newton ${row.method ?? "A*"}`}
              </span>
              <span className={traverseStyles.pathOptionStatus} data-status={row.status}>
                {active ? "Active (preview)" : rowStatusLabel(row.status)}
              </span>
            </div>
            {candidate && (
              <div className={traverseStyles.pathOptionDetail}>
                {formatNumberWithCommas(Math.round(candidate.distanceMeters))} m
                {row.runtimeMs != null && <> · planned in {Math.round(row.runtimeMs / 1000)} s</>}
                {active && preview && (
                  <>
                    {" "}
                    · {preview.path.length} of {preview.rawVertexCount} vertices
                  </>
                )}
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
          </OptionRow>
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
