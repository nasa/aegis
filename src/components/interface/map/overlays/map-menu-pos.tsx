import type { FunctionComponent } from "react";
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
import { thunkAddPosEntry, thunkEditPosEntry } from "store/thunk/thunkRexPosEntry";

// Content of the "Positions" tab in the floating Rex Menu widget on the map.
export const MapPositionMenu: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const hasEditPermission = useAppSelector(
    (s) => !!s.user.missionPerms?.permissions.edit,
    refEqual
  );
  const selectedRexUuid = useAppSelector((s) => s.rex.selectedRexUuid, refEqual);
  const inEdit = useAppSelector((s) => s.rex.posEntryInEdit, deepEqual);
  const selectedRex = useMissionDocSelector(
    (m) => (selectedRexUuid ? (m.rexes?.[selectedRexUuid] ?? null) : null),
    deepEqual
  );
  const source = useMissionDocSelector((m) => {
    const rex = selectedRexUuid ? m.rexes?.[selectedRexUuid] : null;
    const eva = rex ? m.evas?.[rex.evaUuid] : null;
    return {
      eva: eva ? getAsPlannedEvaFromRefUuid(m, eva.refUuid)?.name : null,
      rex: rex?.name || selectedRexUuid,
    };
  }, refEqual);
  const coordinateContext = useCoordinateEntryContext();

  const canEditPositions = hasEditPermission && !!selectedRex?.isRunning;
  const sessionInRex = !!inEdit && inEdit.rexUuid === selectedRex?.uuid;

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
      className={`${assetStyles.assetsMenu} ${posStyles.positionsMenu} ${selectedRex.isRunning ? posStyles.executing : ""}`}
      data-testid="positions-menu"
    >
      <div className={assetStyles.toolbar}>
        <span className={posStyles.toolbarTitle}>
          <span
            className={posStyles.evaName}
            title={source.eva || undefined}
            data-testid="positions-menu-eva"
          >
            {source.eva || "—"}
          </span>
          <span>/</span>
          <span
            className={posStyles.rexName}
            title={source.rex || undefined}
            data-testid="positions-menu-rex"
          >
            {source.rex || "—"}
          </span>
        </span>
        {hasEditPermission && (
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
            enabled={canEditPositions && !(sessionInRex && inEdit.isNew)}
          />
        )}
      </div>
      {sessionInRex && inEdit.isNew && (
        <PositionEditor
          inEdit={inEdit}
          rex={selectedRex}
          canEditPositions={canEditPositions}
          coordinateContext={coordinateContext}
        />
      )}
      <div className={assetStyles.tableContainer}>
        <PositionTable
          rex={selectedRex}
          hasEditPermission={hasEditPermission}
          canEditPositions={canEditPositions}
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
