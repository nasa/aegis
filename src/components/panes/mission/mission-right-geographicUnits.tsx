import type { FunctionComponent } from "react";
import { memo, useRef } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import { deepEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button } from "components/interface/form/globalFields";
import { validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMissionDocSelector } from "utils/useDocSelector";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocDeleteGeoUnit } from "store/thunk/thunkMissionGeoUnit";
import {
  applyCreateGeoUnit,
  applyUpdateGeoUnitByField,
} from "client/automerge/apply/apply-mission-geoUnit";
import { withMissionChange } from "client/automergeDocHandles";

const GeographicUnits_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const geographicUnits: GeographicUnits = useMissionDocSelector(
    (mission) => mission.geographicUnits,
    deepEqual
  );

  const sortedGeographicUnits: [string, GeographicUnit][] = geographicUnits
    ? Object.entries(geographicUnits).sort(([, a], [, b]) => a.name.localeCompare(b.name))
    : [];

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
            <div>
              <ul className={missionStyles.propertyList}>
                <li className={missionStyles.propertyListItem}>
                  <div>
                    <div
                      className={missionStyles.propertyRowHeader}
                      style={{ backgroundColor: "var(--grey2)" }}
                    >
                      <div className={missionStyles.propertyRowName}>Name</div>
                      <div className={missionStyles.propertyRowAbbr}>Abbr</div>
                      <div className={missionStyles.propertyRowTrashContainer}></div>
                    </div>
                  </div>
                </li>

                {sortedGeographicUnits.map(([uuid, geoUnit], index) => (
                  <li
                    key={uuid}
                    className={missionStyles.propertyListItem}
                    aria-label="geoUnitList-item"
                  >
                    <MemoizedGeographicUnit
                      key={uuid}
                      uuid={uuid}
                      geoUnit={geoUnit}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
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
                    withMissionChange((m) => applyCreateGeoUnit(m));
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
  geoUnit: GeographicUnit;
  editMode: boolean;
  evenRow: boolean;
}> = ({ uuid, geoUnit, editMode, evenRow }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();

  let backgroundColor: string = "var(--grey2)";
  backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";

  return (
    <div ref={divRef}>
      <div className={missionStyles.propertyRow} style={{ backgroundColor }}>
        <div className={missionStyles.propertyRowName}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "geographicUnitItemName",
              ariaLabel: "Geographic unit name",
              validators: [validators.maxLength(255), validators.required],
            }}
            value={geoUnit.name}
            onSubmit={(val: string) => {
              withMissionChange((m) =>
                applyUpdateGeoUnitByField(m, {
                  geoUnitUuid: uuid,
                  fieldName: "name",
                  value: val,
                })
              );
            }}
            key={`${uuid}-name`}
            focusContents={geoUnit.name === "(Geographic Unit Name)"}
          />
        </div>
        <div className={missionStyles.propertyRowAbbr}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "geographicUnitItemAbbr",
              ariaLabel: "Geographic unit abbreviation",
              validators: [validators.maxLength(5), validators.required],
            }}
            value={geoUnit.abbr ?? ""}
            onSubmit={(val: string) => {
              withMissionChange((m) =>
                applyUpdateGeoUnitByField(m, {
                  geoUnitUuid: uuid,
                  fieldName: "abbr",
                  value: val,
                })
              );
            }}
            key={`${uuid}-abbr`}
          />
        </div>

        <div className={missionStyles.propertyRowTrashContainer}>
          <div className={missionStyles.propertyRowTrash}>
            {editMode && (
              <FontAwesomeIcon
                icon={faTrashAlt}
                size="sm"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const result = await dispatch(
                    thunkDocDeleteGeoUnit({ geographicUnitUuid: uuid })
                  );
                  if (thunkDocDeleteGeoUnit.rejected.match(result) && result.payload) {
                    alert(result.payload);
                  }
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

/**
 * Memoized version of the GeographicUnit component to prevent unnecessary re-renders
 * when the props haven't changed.
 * This is especially useful when the component is part of a list.
 * The memoization is based on the props passed to the component.
 * The component will only re-render if the props change.
 */
const MemoizedGeographicUnit = memo(GeographicUnit);
