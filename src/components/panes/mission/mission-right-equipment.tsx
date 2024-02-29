import { FunctionComponent, useEffect, useState } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./mission.module.css";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button, Checkbox, InLineEditInput } from "components/interface/form/globalFields";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { toDecimal } from "utils/formatting";
import {
  thunkCreateEquipment,
  thunkDeleteEquipment,
  thunkUpdateEquipment,
} from "store/thunk/thunkMission-equipment";

const Equipment_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const [newEquipmentUuid, setNewEquipmentUuid] = useState(undefined);

  useEffect(() => {
    if (newEquipmentUuid !== undefined) {
      setTimeout(() => {
        setNewEquipmentUuid(undefined);
      }, 300);
    }
  }, [newEquipmentUuid]);

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle}>Mission Equipment</div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Equipment Inventory</SubpanelHeading>
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
                      <div className={styles.propertyRowQuantity}>Quantity</div>
                      <div className={styles.propertyRowSingleuse}>Single Use</div>
                      <div className={styles.propertyRowTrash}></div>
                    </div>
                  </div>
                </li>

                {mission?.equipmentItems?.map((item, index) => (
                  <li key={item.uuid} className={styles.propertyListItem}>
                    <EquipmentItem
                      key={item.uuid}
                      item={item}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
                      toFocus={newEquipmentUuid === item.uuid}
                    />
                  </li>
                ))}
              </ul>

              {editMode && (
                <Button
                  icon={faPlusCircle}
                  label="Add Equipment Type"
                  style={{ width: "155px", marginLeft: "18px", marginTop: "8px" }}
                  onClick={async () => {
                    setNewEquipmentUuid((await dispatch(thunkCreateEquipment())).payload);
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

export default Equipment_Panel;

const EquipmentItem: FunctionComponent<{
  item: EquipmentItem;
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
              name: "equipmentItemName",
              ariaLabel: "Equipment item name",
              style: { width: "100%" },
              validators: [validators.maxLength(255), validators.required],
            }}
            value={item.name}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateEquipment({
                  uuid: item.uuid,
                  fieldName: "name",
                  value: val,
                })
              );
            }}
            key={`${item.uuid}-name`}
            toFocus={toFocus}
          />
        </div>
        <div className={styles.propertyRowQuantity}>
          <InLineEditInput
            editing={editMode}
            fieldProps={{
              name: "equipmentItemQuantity",
              ariaLabel: "Equipment item quantity",
              style: { width: "45px" },
              validators: [
                validators.maxLength(3),
                validators.minValue(1),
                validators.mustBeInteger,
                validators.required,
              ],
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
              },
            }}
            value={item.quantity?.toString()}
            onSubmit={(val: string) => {
              dispatch(
                thunkUpdateEquipment({
                  uuid: item.uuid,
                  fieldName: "quantity",
                  value: toDecimal(val),
                })
              );
            }}
            key={`${item.uuid}-quantity`}
          />
        </div>
        <div className={styles.propertyRowSingleuse}>
          <div className={styles.propertyRowSingleuseCheckbox}>
            {editMode ? (
              <Checkbox
                checked={item.singleUse}
                editable={editMode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  dispatch(
                    thunkUpdateEquipment({
                      uuid: item.uuid,
                      fieldName: "singleUse",
                      value: e.target.checked,
                    })
                  );
                }}
                toolTip={`Single-use item`}
              />
            ) : (
              <div>{item.singleUse ? "Yes" : ""}</div>
            )}
          </div>
        </div>
        <div className={styles.propertyRowTrash}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dispatch(thunkDeleteEquipment({ equipmentItemUuid: item.uuid }));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
