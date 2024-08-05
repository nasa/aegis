import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./mission.module.css";
import { useAppSelector, deepEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkCreateGeoUnit,
  thunkDeleteGeoUnit,
  thunkUpdateGeoUnit,
} from "store/thunk/thunkMission-geoUnits";

const GeographiUnits_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, deepEqual);
  const [newGeoUuid, setNewGeoUuid] = useState(undefined);

  // Unmarks newest list item as "new" after a short timeout (for autofocusing)
  useEffect(() => {
    if (newGeoUuid !== undefined) {
      setTimeout(() => {
        setNewGeoUuid(undefined);
      }, 300);
    }
  }, [newGeoUuid]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Mission Geography
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Geographic Units</SubpanelHeading>
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
                      <div className={styles.propertyRowTrash}></div>
                    </div>
                  </div>
                </li>

                {mission?.geographicUnits?.map((item, index) => (
                  <li
                    key={item.uuid}
                    className={styles.propertyListItem}
                    aria-label="geoUnitList-item"
                  >
                    <GeographicUnit
                      key={item.uuid}
                      item={item}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
                      toFocus={newGeoUuid === item.uuid}
                    />
                  </li>
                ))}
              </ul>

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add Geographic Unit"
                  style={{ width: "155px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={async () => {
                    setNewGeoUuid((await dispatch(thunkCreateGeoUnit())).payload);
                  }}
                  ariaLabel="addGeoUnitButton"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeographiUnits_Panel;

const GeographicUnit: FunctionComponent<{
  item: GeographicUnit;
  editMode: boolean;
  evenRow: boolean;
  toFocus: boolean;
}> = ({ item, editMode, evenRow, toFocus }) => {
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
              name: "geographicUnitItemName",
              ariaLabel: "Geographic unit name",
              style: { width: "100%" },
              validators: [validators.maxLength(255), validators.required],
            }}
            value={item.name}
            onSubmit={(val: string) => {
              dispatch(thunkUpdateGeoUnit({ uuid: item.uuid, fieldName: "name", value: val }));
            }}
            key={`${item.uuid}-name`}
            toFocus={toFocus}
          />
        </div>

        <div className={styles.propertyRowTrash}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: item.uuid }));
              }}
              aria-label="deleteButton"
            />
          )}
        </div>
      </div>
    </div>
  );
};
