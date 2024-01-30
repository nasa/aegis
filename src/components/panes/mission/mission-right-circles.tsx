import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import _ from "lodash";
import { faPlusCircle, faTrashAlt, faList } from "@fortawesome/free-solid-svg-icons";
import { regExValidators, validators } from "components/interface/form/formValidators";
import styles from "./mission.module.css";
import { Button, InLineEditInput } from "components/interface/form/globalFields";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SubpanelHeading } from "components/interface/_global-elements";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import {
  thunkCreateLanderRadius,
  thunkDeleteLanderRadius,
  thunkUpdateLanderRadius,
} from "store/thunk/thunkMission-radii";

const Radii_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Vector Definitions</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Lander Radius Circles</SubpanelHeading>
            </div>
            <div className={paneStyles.panelSectionBody}>
              {mission?.projEpsg.includes("IAU2000") ? (
                <div className={styles.propertyRow} style={{ backgroundColor: "var(--grey2)" }}>
                  <div className={styles.propertyRowName}>
                    <div className={styles.propertyRowName}>
                      Currently not available for lunar south pole map projections due to a bug.
                      <br /> <br />
                      Please contact the AEGIS team on how to get custom vector layers made for this
                      mission.
                    </div>
                  </div>
                </div>
              ) : (
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
                    <li key={item.uuid} className={styles.propertyListItem}>
                      <RadiusItem
                        key={item.uuid}
                        landerRadius={item}
                        editMode={editMode}
                        evenRow={index % 2 === 0}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add New Radii"
                  style={{ width: "120px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={() => {
                    dispatch(thunkCreateLanderRadius());
                  }}
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
}> = ({ landerRadius, editMode, evenRow }) => {
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
