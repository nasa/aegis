import type { FunctionComponent } from "react";
import { useEffect } from "react";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";

import assetStyles from "./map-menu-assets.module.css";
import posStyles from "./map-menu-pos.module.css";
import { Button } from "components/interface/form/globalFields";
import { PositionEditor } from "./map-menu-pos-editor";
import { PositionTable } from "./map-menu-pos-table";
import { useCoordinateEntryContext } from "../hooks/useCoordinateEntryContext";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import {
  thunkAddPosEntry,
  thunkCancelPosEntryEdit,
  thunkEditPosEntry,
} from "store/thunk/thunkRexPosEntry";

// Content of the "Positions" tab in the floating Rex Menu widget on the map.
export const MapPositionMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const canEdit = useAppSelector((s) => !!s.user.missionPerms?.permissions.edit, refEqual);
  const selectedRexUuid = useAppSelector((s) => s.rex.selectedRexUuid, refEqual);
  const inEdit = useAppSelector((s) => s.rex.posEntryInEdit, deepEqual);
  const selectedRex = useMissionDocSelector(
    (m) => (selectedRexUuid ? (m.rexes?.[selectedRexUuid] ?? null) : null),
    deepEqual
  );
  const evaAndRexName = useMissionDocSelector((m) => {
    const rex = selectedRexUuid ? m.rexes?.[selectedRexUuid] : null;
    if (!rex) return "";
    const eva = m.evas?.[rex.evaUuid];
    if (!eva) return rex.name ?? "";
    return `${getAsPlannedEvaFromRefUuid(m, eva.refUuid)?.name ?? ""} - ${rex.name ?? ""}`;
  }, refEqual);
  const coordinateContext = useCoordinateEntryContext();

  const canMutate = canEdit && !!selectedRex?.isRunning;
  const sessionInRex = !!inEdit && inEdit.rexUuid === selectedRex?.uuid;

  // Discard a session whose REX is no longer selected, or whose saved entry was deleted.
  const sessionStale =
    !!inEdit &&
    (!sessionInRex ||
      (!inEdit.isNew && !selectedRex?.posEntries?.some((entry) => entry.uuid === inEdit.uuid)));
  useEffect(() => {
    if (sessionStale) dispatch(thunkCancelPosEntryEdit());
  }, [dispatch, sessionStale]);

  // The widget is available without a REX, e.g. during planning or with a deleted REX selected.
  if (!selectedRex) {
    return (
      <div className={posStyles.noRexPlaceholder} data-testid="positions-no-rex">
        Select a REX to see positions.
      </div>
    );
  }

  return (
    <div
      className={`${assetStyles.assetsMenu} ${selectedRex.isRunning ? posStyles.executing : ""}`}
      data-testid="positions-menu"
    >
      <div className={assetStyles.toolbar}>
        <span className={posStyles.toolbarTitle} title={evaAndRexName}>
          {evaAndRexName}
        </span>
        {canEdit && (
          <Button
            onClick={() => dispatch(thunkAddPosEntry())}
            icon={faPlusCircle}
            label="Position"
            toolTip={
              !selectedRex.isRunning
                ? "Positions can only be added while the REX is running"
                : inEdit?.isNew
                  ? "Save or cancel the open position first"
                  : undefined
            }
            className={assetStyles.toolbarButton}
            enabled={canMutate && !(sessionInRex && inEdit.isNew)}
          />
        )}
      </div>
      {sessionInRex && inEdit.isNew && (
        <PositionEditor
          inEdit={inEdit}
          rex={selectedRex}
          canMutate={canMutate}
          coordinateContext={coordinateContext}
        />
      )}
      <div className={assetStyles.tableContainer}>
        <PositionTable
          rex={selectedRex}
          canEdit={canEdit}
          canMutate={canMutate}
          inEdit={sessionInRex ? inEdit : null}
          coordinateContext={coordinateContext}
          onEdit={(posEntryUuid) => {
            if (inEdit?.uuid !== posEntryUuid) dispatch(thunkEditPosEntry({ posEntryUuid }));
          }}
        />
      </div>
    </div>
  );
};
