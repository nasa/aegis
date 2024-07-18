import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { faPlusCircle, faTrashAlt, faList } from "@fortawesome/free-solid-svg-icons";
import { regExValidators, validators } from "components/interface/form/formValidators";
import styles from "./mission.module.css";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SubpanelHeading } from "components/interface/_global-elements";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkCreateLanderRadius,
  thunkDeleteLanderRadius,
  thunkUpdateLanderRadius,
} from "store/thunk/thunkMission-radii";

const Radii_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, deepEqual);
  const [newRadiusUuid, setNewRadiusUuid] = useState(undefined);

  // Unmarks newest list item as "new" after a short timeout (for autofocusing)
  useEffect(() => {
    if (newRadiusUuid !== undefined) {
      setTimeout(() => {
        setNewRadiusUuid(undefined);
      }, 300);
    }
  }, [newRadiusUuid]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Vector Definitions
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Lander Radius Circles</SubpanelHeading>
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
                      <div className={styles.propertyRowTrash}></div>
                    </div>
                  </div>
                </li>

                {mission?.landerRadii?.map((item, index) => (
                  <li
                    key={item.uuid}
                    className={styles.propertyListItem}
                    aria-label="radiiList-item"
                  >
                    <RadiusItem
                      key={item.uuid}
                      landerRadius={item}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
                      toFocus={newRadiusUuid === item.uuid}
                    />
                  </li>
                ))}
              </ul>

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add New Radii"
                  style={{ width: "120px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={async () => {
                    setNewRadiusUuid((await dispatch(thunkCreateLanderRadius())).payload);
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

export default Radii_Panel;

const RadiusItem: FunctionComponent<{
  landerRadius: LanderRadius;
  editMode: boolean;
  evenRow: boolean;
  toFocus: boolean;
}> = ({ landerRadius, editMode, evenRow, toFocus }) => {
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
              name: "landerRadiusName",
              ariaLabel: "Lander radius name",
              style: { width: "100%" },
              validators: [validators.maxLength(255), validators.required],
            }}
            value={landerRadius.name}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateLanderRadius({
                  uuid: landerRadius.uuid,
                  fieldName: "name",
                  value: val,
                })
              );
            }}
            key={`${landerRadius.uuid}-name`}
            toFocus={toFocus}
          />
        </div>
        <div className={styles.propertyRowQuantity}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "landerRadiusRange",
              ariaLabel: "Lander radius range",
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
            value={landerRadius.radius?.toString()}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateLanderRadius({
                  uuid: landerRadius.uuid,
                  fieldName: "radius",
                  value: Number(val),
                })
              );
            }}
            key={`${landerRadius.uuid}-radius`}
          />
        </div>

        <div className={styles.propertyRowTrash}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              aria-label="deleteButton"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dispatch(thunkDeleteLanderRadius({ landerRadiusUuid: landerRadius.uuid }));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
