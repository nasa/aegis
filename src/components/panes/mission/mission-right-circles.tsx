import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import { faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { regExValidators, validators } from "components/interface/form/formValidators";
import styles from "./mission.module.css";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkCreateCircleDefinition,
  thunkDeleteCircleDefinition,
  thunkUpdateCircleDefinition,
} from "store/thunk/thunkMission-circleDefs";

const CircleDefinitions_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const sortedCircleDefinitions: [string, CircleDefinition][] = useAppSelector((state) => {
    if (!state.mission.mission.circleDefinitions) return [];
    return Object.entries(state.mission.mission.circleDefinitions).sort(
      ([, a], [, b]) => a.radius - b.radius
    );
  }, deepEqual);
  const [newCircleDefUuid, setNewCircleDefUuid] = useState(undefined);

  // Un-marks newest list item as "new" after a short timeout (for auto focusing)
  useEffect(() => {
    if (newCircleDefUuid !== undefined) {
      setTimeout(() => {
        setNewCircleDefUuid(undefined);
      }, 300);
    }
  }, [newCircleDefUuid]);

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
            <div className={paneStyles.panelSectionBody}>
              <ul className={styles.propertyList}>
                <li className={styles.propertyListItem}>
                  <div className={paneStyles.descriptionContainer}>
                    <div
                      className={styles.propertyRowHeader}
                      style={{ backgroundColor: "var(--grey2)" }}
                    >
                      <div className={styles.propertyRowName}>Name</div>
                      <div className={styles.propertyRowSingleuse}>{"Radius (m)"}</div>
                      <div className={styles.propertyRowTrashContainer}></div>
                    </div>
                  </div>
                </li>

                {sortedCircleDefinitions.map(([uuid, circleDef], index) => (
                  <li
                    key={uuid}
                    className={styles.propertyListItem}
                    aria-label="circle-definition-item"
                  >
                    <RadiusItem
                      key={uuid}
                      uuid={uuid}
                      circleDef={circleDef}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
                      toFocus={newCircleDefUuid === uuid}
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
                    setNewCircleDefUuid((await dispatch(thunkCreateCircleDefinition())).payload);
                  }}
                  ariaLabel="addNewRadiusButton"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CircleDefinitions_Panel;

const RadiusItem: FunctionComponent<{
  uuid: string;
  circleDef: CircleDefinition;
  editMode: boolean;
  evenRow: boolean;
  toFocus: boolean;
}> = ({ uuid, circleDef, editMode, evenRow, toFocus }) => {
  const dispatch = useAppDispatch();

  let backgroundColor: string = "var(--grey2)";
  if (!editMode) {
    backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";
  }

  return (
    <div className={paneStyles.descriptionContainer}>
      <div className={styles.propertyRow} style={{ backgroundColor }}>
        <div className={styles.propertyRowName}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "circleDefName",
              ariaLabel: "Circle Definition Name",
              style: { width: "100%" },
              validators: [validators.maxLength(255), validators.required],
            }}
            value={circleDef.name}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateCircleDefinition({
                  uuid,
                  fieldName: "name",
                  value: val,
                })
              );
            }}
            key={`${uuid}-name`}
            toFocus={toFocus}
          />
        </div>
        <div className={styles.propertyRowQuantity}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "circleDefRange",
              ariaLabel: "Circle Definition Range",
              style: { width: "60px" },
              validators: [
                validators.maxLength(7),
                validators.minValue(1),
                validators.mustBeInteger,
                validators.required,
              ],
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
              },
            }}
            value={circleDef.radius?.toString()}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateCircleDefinition({
                  uuid: uuid,
                  fieldName: "radius",
                  value: Number(val),
                })
              );
            }}
            key={`${uuid}-radius`}
          />
        </div>

        <div
          className={styles.propertyRowTrashContainer}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (editMode) {
              dispatch(thunkDeleteCircleDefinition({ circleDefUuid: uuid }));
            }
          }}
        >
          {editMode && (
            <div className={styles.propertyRowTrash}>
              <FontAwesomeIcon icon={faTrashAlt} size="sm" aria-label="deleteButton" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
