import { FunctionComponent, memo, useRef } from "react";
import paneStyles from "../global-pane-styles.module.css";
import missionStyles from "./mission.module.css";
import { deepEqual } from "utils/useAppSelector";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button, Checkbox } from "components/interface/form/globalFields";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAppDispatch } from "utils/useAppDispatch";
import { toDecimal } from "utils/formatting";
import { thunkDeleteEquipment } from "store/thunk/thunkMission-equipment";
import { useMissionDocSelector } from "utils/useDocSelector";
import { ValidatedInputField } from "components/interface/form/globalFieldsAutomerge";
import {
  crudCreateEquipmentItem,
  crudUpdateEquipmentItemByField,
} from "client/crud/crud-mission-equipment";

const Equipment_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const missionEquipItems: EquipmentItems = useMissionDocSelector(
    (doc) => doc.equipmentItems,
    deepEqual
  );

  const sortedEquipmentItems: [string, EquipmentItem][] = missionEquipItems
    ? Object.entries(missionEquipItems).sort(([, a], [, b]) => a.name.localeCompare(b.name))
    : [];

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitle} aria-label="rightBodyTitle">
        Mission Equipment
      </div>
      <div className={paneStyles.rightBodyBody}>
        <div className={paneStyles.panelContainer}>
          <div className={paneStyles.panelSection}>
            <div className={paneStyles.panelSectionTitle} style={{ marginBottom: "8px" }}>
              <SubpanelHeading icon={faList}>Equipment Inventory</SubpanelHeading>
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
                      <div className={missionStyles.propertyRowQuantity}>Quantity</div>
                      <div className={missionStyles.propertyRowSingleUse}>Single Use</div>
                      <div className={missionStyles.propertyRowTrash}></div>
                    </div>
                  </div>
                </li>

                {sortedEquipmentItems.map(([uuid, equipItem], index) => (
                  <li
                    key={uuid}
                    className={missionStyles.propertyListItem}
                    aria-label="equipmentList-item"
                  >
                    <MemoizedEquipmentItem
                      key={uuid}
                      uuid={uuid}
                      equipItem={equipItem}
                      editMode={editMode}
                      evenRow={index % 2 === 0}
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
                    crudCreateEquipmentItem();
                  }}
                  ariaLabel="addNewEquipmentButton"
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
  uuid: string;
  equipItem: EquipmentItem;
  editMode: boolean;
  evenRow: boolean;
}> = ({ uuid, equipItem, editMode, evenRow }) => {
  const dispatch = useAppDispatch();
  const divRef = useRef<HTMLDivElement>(null);

  let backgroundColor: string = "var(--grey2)";
  backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";

  return (
    <div ref={divRef}>
      <div className={missionStyles.propertyRow} style={{ backgroundColor }}>
        <div className={missionStyles.propertyRowName}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "equipmentItemName",
              ariaLabel: "Equipment item name",
              validators: [validators.maxLength(255), validators.required],
            }}
            value={equipItem.name}
            onSubmit={(val: string) => {
              crudUpdateEquipmentItemByField(uuid, "name", val);
            }}
            key={`${uuid}-name`}
            focusContents={equipItem.name === "(Equipment Name)"}
          />
        </div>
        <div className={missionStyles.propertyRowQuantity}>
          <ValidatedInputField
            editMode={editMode}
            fieldProps={{
              name: "equipmentItemQuantity",
              ariaLabel: "Equipment item quantity",
              validators: [
                validators.maxLength(3),
                validators.minValue(1),
                validators.mustBeInteger,
                validators.required,
              ],
            }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              e.target.value = e.target.value.replace(regExValidators.regExNumber, "");
            }}
            value={equipItem.quantity?.toString()}
            onSubmit={(val: string) => {
              crudUpdateEquipmentItemByField(uuid, "quantity", toDecimal(val));
            }}
            key={`${uuid}-quantity`}
          />
        </div>
        <div className={missionStyles.propertyRowSingleUse}>
          <div className={missionStyles.propertyRowSingleUseCheckbox}>
            {editMode ? (
              <Checkbox
                checked={equipItem.singleUse}
                editable={editMode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  crudUpdateEquipmentItemByField(uuid, "singleUse", e.target.checked);
                }}
                toolTip={`Single Use Item`}
              />
            ) : (
              <div aria-label="checkboxText">{equipItem.singleUse ? "Yes" : ""}</div>
            )}
          </div>
        </div>
        <div className={missionStyles.propertyRowTrashContainer}>
          <div className={missionStyles.propertyRowTrash}>
            {editMode && (
              <FontAwesomeIcon
                icon={faTrashAlt}
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dispatch(thunkDeleteEquipment({ equipmentItemUuid: uuid }));
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
 * Memoized version of the EquipmentItem component to prevent unnecessary re-renders
 * when the props haven't changed.
 * This is especially useful when the component is part of a list.
 * The memoization is based on the props passed to the component.
 * The component will only re-render if the props change.
 */
const MemoizedEquipmentItem = memo(EquipmentItem);
