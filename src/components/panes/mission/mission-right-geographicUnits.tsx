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

const GeographicUnits_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const sortedGeographicUnits: [string, GeographicUnit][] = useAppSelector((state) => {
    if (!state.mission.mission.geographicUnits) return [];
    return Object.entries(state.mission.mission.geographicUnits).sort(([, a], [, b]) =>
      a.name.localeCompare(b.name)
    );
  }, deepEqual);
  const [newGeoUuid, setNewGeoUuid] = useState(undefined);

  // Un-marks newest list item as "new" after a short timeout (for auto focusing)
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
                      <div className={styles.propertyRowAbbr}>Abbr</div>
                      <div className={styles.propertyRowTrashContainer}></div>
                    </div>
                  </div>
                </li>

                {sortedGeographicUnits.map(([uuid, geoUnit], index) => (
                  <li key={uuid} className={styles.propertyListItem} aria-label="geoUnitList-item">
                    <GeographicUnit
                      key={uuid}
                      uuid={uuid}
                      item={geoUnit}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
                      toFocus={newGeoUuid === uuid}
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

export default GeographicUnits_Panel;

const GeographicUnit: FunctionComponent<{
  uuid: string;
  item: GeographicUnit;
  editMode: boolean;
  evenRow: boolean;
  toFocus: boolean;
}> = ({ uuid, item, editMode, evenRow, toFocus }) => {
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
              dispatch(thunkUpdateGeoUnit({ uuid: uuid, fieldName: "name", value: val }));
            }}
            key={`${uuid}-name`}
            toFocus={toFocus}
          />
        </div>
        <div className={styles.propertyRowAbbr}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "geographicUnitItemAbbr",
              ariaLabel: "Geographic unit abbreviation",
              style: { width: "50px" },
              validators: [validators.maxLength(5), validators.required],
            }}
            value={item.abbr}
            onSubmit={(val: string) => {
              dispatch(thunkUpdateGeoUnit({ uuid: uuid, fieldName: "abbr", value: val }));
            }}
            key={`${uuid}-abbr`}
            toFocus={toFocus}
          />
        </div>

        <div className={styles.propertyRowTrashContainer}>
          <div className={styles.propertyRowTrash}>
            {editMode && (
              <FontAwesomeIcon
                icon={faTrashAlt}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: uuid }));
                }}
                aria-label="deleteButton"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
