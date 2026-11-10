import type { FunctionComponent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { faBan, faCaretDown, faCaretRight, faEdit, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import assetStyles from "./map-menu-assets.module.css";
import posStyles from "./map-menu-pos.module.css";
import { RowMenu } from "./map-menu-assets-table";
import { PositionEditor } from "./map-menu-pos-editor";
import { PathColorPickerMenu } from "components/interface/form/globalFields";
import { LastEditedNumeric } from "components/interface/_global-elements";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { setExpandedPosEntryUuid, setSelectedPosEntryUuid } from "store/rex";
import { setHoverUuidsForPosEntry } from "store/hover";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { thunkCancelPosEntryEdit, thunkDeletePosEntry } from "store/thunk/thunkRexPosEntry";
import { getLatestPosEntryUuids, orderPosEntriesNewestFirst } from "utils/posEntries";
import { formatCoordinateEntry, formatLatLng } from "utils/coordinateEntry";
import { hhmmssFromSeconds } from "utils/formatting";
import { calcPathDurationMins, getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

const COLUMN_COUNT = 6;

type Props = {
  rex: Rex;
  /** Mission edit permission; controls whether the actions column renders. */
  canEdit: boolean;
  /** Edit permission on a running REX. */
  canMutate: boolean;
  inEdit: PosEntryInEdit | null;
  coordinateContext: CoordinateEntryContext;
  onEdit: (posEntryUuid: string) => void;
};

/** Names of an entry's pos types in the REX's pos-type order (EV1, EV2, Cart, …). */
function getPosTypeNames(rex: Rex, entry: PosEntry): string[] {
  return (rex.posTypes ?? [])
    .filter((type) => entry.posTypeUuids?.includes(type.uuid))
    .map((type) => type.name);
}

// One table: each pos type's latest entry is pinned in the Latest group, every other entry is in
// the collapsible Earlier group. Both are newest-first by PET; # counts up from the oldest.
export const PositionTable: FunctionComponent<Props> = ({
  rex,
  canEdit,
  canMutate,
  inEdit,
  coordinateContext,
  onEdit,
}) => {
  const expandedUuid = useAppSelector((s) => s.rex.expandedPosEntryUuid, refEqual);
  const [earlierOpen, setEarlierOpen] = useState(true);
  const columnCount = canEdit ? COLUMN_COUNT : COLUMN_COUNT - 1;

  const ordered = orderPosEntriesNewestFirst(rex.posEntries ?? []);
  const latestUuids = getLatestPosEntryUuids(ordered);
  const latest = ordered.filter((entry) => latestUuids.has(entry.uuid));
  const earlier = ordered.filter((entry) => !latestUuids.has(entry.uuid));
  const numberByUuid = new Map(ordered.map((entry, index) => [entry.uuid, ordered.length - index]));
  const editingUuid = inEdit && !inEdit.isNew ? inEdit.uuid : null;

  const renderRow = (entry: PosEntry) => {
    const isEditing = editingUuid === entry.uuid;
    return (
      <PositionRow
        key={entry.uuid}
        entry={entry}
        number={numberByUuid.get(entry.uuid)}
        rex={rex}
        columnCount={columnCount}
        canEdit={canEdit}
        canMutate={canMutate}
        isExpanded={expandedUuid === entry.uuid || isEditing}
        isEditing={isEditing}
        inEdit={isEditing ? inEdit : null}
        coordinateContext={coordinateContext}
        onEdit={onEdit}
      />
    );
  };

  return (
    <>
      <table className={assetStyles.assetTable} data-testid="position-table">
        <colgroup>
          <col className={posStyles.colNumber} />
          <col className={posStyles.colPet} />
          <col className={posStyles.colTypes} />
          <col className={assetStyles.colCoords} />
          <col className={posStyles.colSource} />
          {canEdit && <col className={assetStyles.colActions} />}
        </colgroup>
        <thead>
          <tr className={assetStyles.headerRow}>
            <th>#</th>
            <th>PET</th>
            <th>Types</th>
            <th>Coords</th>
            <th>Src</th>
            {canEdit && <th aria-label="Actions" />}
          </tr>
        </thead>
        {latest.length > 0 && (
          <PositionGroup label="Latest" columnCount={columnCount} testId="position-group-latest">
            {latest.map(renderRow)}
          </PositionGroup>
        )}
        {earlier.length > 0 && (
          <PositionGroup
            label={`Earlier (${earlier.length})`}
            columnCount={columnCount}
            testId="position-group-earlier"
            isOpen={earlierOpen || earlier.some((entry) => entry.uuid === editingUuid)}
            onToggle={() => setEarlierOpen(!earlierOpen)}
          >
            {earlier.map(renderRow)}
          </PositionGroup>
        )}
      </table>
      {ordered.length === 0 && (
        <div className={assetStyles.emptyState} data-testid="position-table-empty">
          {canMutate ? "No positions yet. Click Position to add one." : "No positions yet."}
        </div>
      )}
    </>
  );
};

const PositionGroup: FunctionComponent<{
  label: string;
  columnCount: number;
  testId: string;
  /** Collapsible when given a toggle; always open otherwise. */
  isOpen?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}> = ({ label, columnCount, testId, isOpen = true, onToggle, children }) => (
  <tbody className={assetStyles.rootGroup} data-testid={testId}>
    <tr className={posStyles.groupRow}>
      <td colSpan={columnCount}>
        {onToggle ? (
          <button
            type="button"
            className={posStyles.groupToggle}
            onClick={onToggle}
            aria-expanded={isOpen}
          >
            <FontAwesomeIcon icon={isOpen ? faCaretDown : faCaretRight} />
            {label}
          </button>
        ) : (
          label
        )}
      </td>
    </tr>
    {isOpen && children}
  </tbody>
);

const PositionRow: FunctionComponent<{
  entry: PosEntry;
  number: number;
  rex: Rex;
  columnCount: number;
  canEdit: boolean;
  canMutate: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  inEdit: PosEntryInEdit | null;
  coordinateContext: CoordinateEntryContext;
  onEdit: (posEntryUuid: string) => void;
}> = ({
  entry,
  number,
  rex,
  columnCount,
  canEdit,
  canMutate,
  isExpanded,
  isEditing,
  inEdit,
  coordinateContext,
  onEdit,
}) => {
  const dispatch = useAppDispatch();
  const isSelected = useAppSelector((s) => s.rex.selectedPosEntryUuid === entry.uuid, refEqual);
  const hasOtherEdit = useAppSelector(
    (s) => !!s.rex.posEntryInEdit && s.rex.posEntryInEdit.uuid !== entry.uuid,
    refEqual
  );
  const isHovered = useAppSelector((s) => s.hover.posEntryItemUuid === entry.uuid, refEqual);
  const rowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [isSelected]);

  const source = rex.posSources?.find((s) => s.uuid === entry.posSourceUuid);
  const typeNames = getPosTypeNames(rex, entry);

  const rowClass = [
    assetStyles.assetRow,
    isSelected ? assetStyles.assetRowSelected : isHovered ? assetStyles.assetRowHover : "",
    isExpanded ? assetStyles.assetRowExpanded : "",
  ].join(" ");

  const cancelOtherEdit = () => {
    if (!hasOtherEdit) return;
    dispatch(thunkCancelPosEntryEdit());
    dispatch(setExpandedPosEntryUuid(null));
  };

  return (
    <>
      <tr
        ref={rowRef}
        className={rowClass}
        data-testid={`position-row-${entry.uuid}`}
        aria-selected={isSelected}
        onMouseEnter={() => dispatch(setHoverUuidsForPosEntry(entry.uuid))}
        onMouseLeave={() => dispatch(setHoverUuidsForPosEntry(null))}
        onClick={() => {
          if (isSelected) {
            if (!isEditing) dispatch(setSelectedPosEntryUuid(null));
            return;
          }
          cancelOtherEdit();
          dispatch(setSelectedPosEntryUuid(entry.uuid));
          dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
        }}
      >
        <td>
          <div className={posStyles.numberCell}>
            <button
              type="button"
              className={assetStyles.rowToggle}
              onClick={(e) => {
                e.stopPropagation();
                if (isExpanded) {
                  if (isEditing) dispatch(thunkCancelPosEntryEdit());
                  dispatch(setExpandedPosEntryUuid(null));
                  return;
                }
                cancelOtherEdit();
                dispatch(setExpandedPosEntryUuid(entry.uuid));
              }}
              aria-label={isExpanded ? "Collapse position" : "Expand position"}
              aria-expanded={isExpanded}
              data-testid={`position-expand-${entry.uuid}`}
            >
              <FontAwesomeIcon icon={isExpanded ? faCaretDown : faCaretRight} size="lg" />
            </button>
            <span className={isSelected ? undefined : posStyles.entryNumber}>{number}</span>
          </div>
        </td>
        <td>{hhmmssFromSeconds(entry.petSeconds)}</td>
        <td data-tooltip-id="aegis-tooltip" data-tooltip-content={typeNames.join(", ")}>
          {typeNames.join(", ")}
        </td>
        <td>
          {entry.location
            ? formatCoordinateEntry(entry.location, { ...coordinateContext, dynamicLgrs: false })
            : "Not placed"}
        </td>
        <td data-tooltip-id="aegis-tooltip" data-tooltip-content={source?.name}>
          {source?.abbr}
        </td>
        {canEdit && (
          <td>
            {canMutate && (
              <RowMenu
                label="Position actions"
                items={[
                  {
                    icon: isEditing ? faBan : faEdit,
                    label: isEditing ? "Cancel Edit" : "Edit Position",
                    onClick: () =>
                      isEditing ? dispatch(thunkCancelPosEntryEdit()) : onEdit(entry.uuid),
                  },
                  {
                    icon: faTrashAlt,
                    label: "Delete Position",
                    onClick: () => {
                      if (window.confirm("Are you sure you want to delete this Crew Position?")) {
                        dispatch(thunkDeletePosEntry({ posEntryUuid: entry.uuid }));
                      }
                    },
                  },
                ]}
              />
            )}
          </td>
        )}
      </tr>
      {isExpanded && (
        <tr className={assetStyles.assetDetailRow} data-testid={`position-detail-row-${entry.uuid}`}>
          <td colSpan={columnCount} className={assetStyles.assetDetailCell}>
            {isEditing ? (
              <PositionEditor
                key={inEdit.uuid}
                inEdit={inEdit}
                rex={rex}
                entry={entry}
                canMutate={canMutate}
                coordinateContext={coordinateContext}
              />
            ) : (
              <PositionDetails
                entry={entry}
                rex={rex}
                typeNames={typeNames}
                sourceName={source?.name}
                coordinateContext={coordinateContext}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
};

/** Live saved values shown when the entry has no open edit session. */
const PositionDetails: FunctionComponent<{
  entry: PosEntry;
  rex: Rex;
  typeNames: string[];
  sourceName: string | undefined;
  coordinateContext: CoordinateEntryContext;
}> = ({ entry, rex, typeNames, sourceName, coordinateContext }) => {
  const walkback = useMissionDocSelector(
    (m) => ({
      landerLocation: m.landerLocation,
      planetRadius: m.planetRadius,
      traverseRate: m.evas?.[rex.evaUuid]?.traverseRate || m.traverseRate,
    }),
    deepEqual
  );
  const distanceToLander =
    entry.location && walkback.landerLocation && walkback.planetRadius
      ? +getDistanceBetweenTwoCoordinates(
          entry.location,
          walkback.landerLocation,
          walkback.planetRadius
        )
      : NaN;
  const walkbackMins = Number.isFinite(distanceToLander)
    ? Math.ceil(calcPathDurationMins([distanceToLander], walkback.traverseRate))
    : NaN;

  return (
    <div
      className={`${assetStyles.editor} ${assetStyles.editorView}`}
      data-testid="position-details"
    >
      <div className={assetStyles.editorForm}>
        <span className={assetStyles.fieldLabel}>Types</span>
        <span data-testid="position-details-types">{typeNames.join(", ") || "—"}</span>
        <span className={assetStyles.fieldLabel}>Source</span>
        <span data-testid="position-details-source">{sourceName || "—"}</span>
        <span className={assetStyles.fieldLabel}>Radius (m)</span>
        <div className={assetStyles.fieldControls}>
          <span data-testid="position-details-uncertainty">{entry.uncertaintyMeters ?? 0}</span>
          <span className={`${assetStyles.fieldLabel} ${assetStyles.inlineFieldLabel}`}>
            Radius color
          </span>
          <PathColorPickerMenu
            circular={true}
            currentColor={entry.color ?? null}
            editMode={false}
            updateColor={() => undefined}
          />
        </div>
        <span className={assetStyles.fieldLabel}>Position</span>
        <span data-testid="position-details-coordinates">
          {entry.location ? formatCoordinateEntry(entry.location, coordinateContext) : "Not placed"}
        </span>
        {entry.location && (
          <div className={`${assetStyles.fieldNote} ${assetStyles.fieldValueColumn}`}>
            {coordinateContext.usingLGRSCoordinates && <span>{formatLatLng(entry.location)}</span>}
            <span data-testid="position-details-elevation">
              Elev. {entry.elevation != null ? `${entry.elevation.toFixed(1)} m` : "—"}
            </span>
          </div>
        )}
        <span className={assetStyles.fieldLabel}>Lander Dist.</span>
        <span data-testid="position-details-lander-distance">
          {Number.isFinite(distanceToLander) ? `${distanceToLander.toFixed(2)} m` : "Not set"}
        </span>
        <span className={assetStyles.fieldLabel}>WB Dur.</span>
        <span data-testid="position-details-walkback">
          {Number.isFinite(walkbackMins) ? `${walkbackMins} min` : "Not set"}
        </span>
        <span className={assetStyles.fieldLabel}>PET</span>
        <span data-testid="position-details-pet">{hhmmssFromSeconds(entry.petSeconds)}</span>
        <div className={assetStyles.editorLastModified}>
          <span className={assetStyles.fieldLabel}>Last Edited:</span>
          <LastEditedNumeric
            updatedAt={entry.updatedAt}
            createdAt={entry.createdAt}
            info={[["Position UUID", entry.uuid]]}
          />
        </div>
      </div>
    </div>
  );
};
