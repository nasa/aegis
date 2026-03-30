import type { FunctionComponent } from "react";
import { memo, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { regExValidators, validators } from "components/interface/form/formValidators";
import missionStyles from "./mission.module.css";
import { Button } from "components/interface/form/globalFields";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { deepEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkSyncPresetsWithMission } from "store/thunk/thunkPreset";
import { thunkSyncStationsWithMission } from "store/thunk/thunkStation";
import { useMissionDocSelector } from "utils/useDocSelector";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import {
  crudCreateCircleDefinition,
  crudDeleteCircleDefinition,
  crudUpdateCircleDefinitionByField,
} from "client/crud/crud-mission-circleDefinition";
import { LoadingOverlay } from "components/interface/_global-elements";

const CircleDefinitions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();

  const missionCircleDefs: CircleDefinitions = useMissionDocSelector(
    (doc) => doc.circleDefinitions,
    deepEqual
  );

  const sortedCircleDefinitions: [string, CircleDefinition][] = missionCircleDefs
    ? Object.entries(missionCircleDefs).sort(([, a], [, b]) => a.radius - b.radius)
    : [];

  const [isSyncing, setIsSyncing] = useState(false);

  const syncPresetsAndStations = async () => {
    setIsSyncing(true);
    await dispatch(thunkSyncPresetsWithMission());
    await dispatch(thunkSyncStationsWithMission());
    setIsSyncing(false);
  };

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Proximity Circle Definitions
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionSubtext}>
              <div>
                The circles defined here are displayed and styled in each Preset for the Lander, and
                each Station.
              </div>
            </div>
            <div>
              <ul className={missionStyles.propertyList}>
                <li className={missionStyles.propertyListItem}>
                  <div>
                    <div
                      className={missionStyles.propertyRowHeader}
                      style={{ backgroundColor: "var(--grey2)" }}
                    >
                      <div className={missionStyles.propertyRowName}>Name</div>
                      <div className={missionStyles.propertyRowRadius}>{"Radius (m)"}</div>
                      <div className={missionStyles.propertyRowTrashContainer}></div>
                    </div>
                  </div>
                </li>

                {sortedCircleDefinitions.map(([uuid, circleDef], index) => (
                  <li
                    key={uuid}
                    className={missionStyles.propertyListItem}
                    aria-label="circle-definition-item"
                  >
                    <MemoizedRadiusItem
                      key={uuid}
                      uuid={uuid}
                      circleDef={circleDef}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
                      syncPresetsAndStations={syncPresetsAndStations}
                    />
                  </li>
                ))}
              </ul>

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add New Circle Definition"
                  style={{ width: "185px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={async () => {
                    crudCreateCircleDefinition();
                    await syncPresetsAndStations();
                  }}
                  ariaLabel="addNewRadiusButton"
                />
              )}
            </div>
          </div>
        </div>
      </div>
      {isSyncing && <LoadingOverlay message="Syncing Presets and Stations..." />}
    </div>
  );
};

export default CircleDefinitions_Panel;

const RadiusItem: FunctionComponent<{
  uuid: string;
  circleDef: CircleDefinition;
  editMode: boolean;
  evenRow: boolean;
  syncPresetsAndStations: () => Promise<void>;
}> = ({ uuid, circleDef, editMode, evenRow, syncPresetsAndStations }) => {
  let backgroundColor: string = "var(--grey2)";
  backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";

  return (
    <div>
      <div className={missionStyles.propertyRow} style={{ backgroundColor }}>
        <div className={missionStyles.propertyRowName}>
          <ValidatedInputField
            value={circleDef.name}
            editMode={editMode}
            fieldProps={{
              name: "circleDefName",
              ariaLabel: "Circle Definition Name",
              validators: [validators.maxLength(255), validators.required],
            }}
            onSubmit={async (val: string) => {
              crudUpdateCircleDefinitionByField(uuid, "name", val);
            }}
            key={`${uuid}-name`}
            focusContents={circleDef.name === "(Circle Definition Name)"}
          />
        </div>
        <div>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "circleDefRange",
              ariaLabel: "Circle Definition Range",
              validators: [
                validators.maxLength(7),
                validators.minValue(1),
                validators.mustBeInteger,
                validators.required,
              ],
            }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
            }}
            value={circleDef.radius?.toString()}
            onSubmit={async (val: string) => {
              crudUpdateCircleDefinitionByField(uuid, "radius", Number(val));
            }}
            key={`${uuid}-radius`}
          />
        </div>

        <div
          className={missionStyles.propertyRowTrashContainer}
          onClick={async () => {
            if (editMode) {
              crudDeleteCircleDefinition(uuid);
              syncPresetsAndStations();
            }
          }}
        >
          {editMode && (
            <div className={missionStyles.propertyRowTrash}>
              <FontAwesomeIcon icon={faTrashAlt} size="sm" aria-label="deleteButton" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Memoized version of the RadiusItem component to prevent unnecessary re-renders
 * when the props haven't changed.
 * This is especially useful when the component is part of a list.
 * The memoization is based on the props passed to the component.
 * The component will only re-render if the props change.
 */
const MemoizedRadiusItem = memo(RadiusItem);
