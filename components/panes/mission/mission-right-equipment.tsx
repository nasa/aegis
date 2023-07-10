import { FunctionComponent } from "react";
import paneStyles from "../global-pane-styles.module.css";
import styles from "./mission.module.css";
import { useAppSelector, shallowEqual } from "utils/useAppSelector";
import _ from "lodash";
import { SubpanelHeading } from "components/interface/_global-elements";
import { faList, faPlusCircle, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { Button, Checkbox, InLineEditInput } from "components/interface/form/globalFields";
import { regExValidators, validators } from "components/interface/form/formValidators";
import { v4 as uuidv4 } from "uuid";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setMission } from "store/mission";
import { useAppDispatch } from "utils/useAppDispatch";
import { toDecimal } from "utils/formatting";

type PrintableListItem = {
  parentType: "Station" | "POI";
  parentName: string;
  actionName: string;
};

const Equipment_Panel: FunctionComponent<{ editMode: boolean }> = ({ editMode }) => {
  const dispatch = useAppDispatch();
  const mission = useAppSelector((state) => state.mission.mission, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);

  const blankEquipmentItem: EquipmentItem = {
    uuid: uuidv4(),
    name: "(Equipment Name)",
    quantity: 1,
    singleUse: false,
  };

  const updateEquipmentItem = (equipmentItem: EquipmentItem) => {
    const itemIndex = mission?.equipmentItems?.findIndex(
      (item) => item.uuid === equipmentItem.uuid
    );
    const newEquipmentItems = [...mission?.equipmentItems];
    newEquipmentItems[itemIndex] = equipmentItem;
    dispatch(setMission({ ...mission, equipmentItems: newEquipmentItems }));
  };

  const deleteEquipmentItem = (equipmentItemUuid: string) => {
    // find all of the actions using this equipment item
    const actionsUsingEquipmentItem = actions.filter((action) =>
      action.equipmentItemsUsage?.some((item) => item.uuid === equipmentItemUuid)
    );

    if (actionsUsingEquipmentItem.length > 0) {
      // compile a list of the actions using this equipment item including their parent poi or station names
      const printableList: PrintableListItem[] = actionsUsingEquipmentItem.map((action) => {
        const parentType = action.poiUuid ? "POI" : "Station";
        let parentName = "";
        if (parentType === "POI") {
          const parentPoi = pois.find((poi) => poi.uuid === action.poiUuid);
          parentName = parentPoi?.name || "";
        } else {
          const parentStation = stations.find((station) => station.uuid === action.stationUuid);
          parentName = parentStation?.name || "";
        }

        return {
          parentType,
          parentName,
          actionName: action.name,
        };
      });

      alert(
        "This equipment item is being used by one or more actions. Please remove it from the following actions before deleting.\n\n" +
          printableList.map((item) => `${item.parentType}: ${item.parentName} - ${item.actionName}`)
      );
      return;
    }

    const newEquipmentItems = mission?.equipmentItems?.filter(
      (item) => item.uuid !== equipmentItemUuid
    );
    dispatch(setMission({ ...mission, equipmentItems: newEquipmentItems }));
  };

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
              <ul className={styles.equipmentList}>
                <li className={styles.equipmentListItem}>
                  <div className={paneStyles.descriptionContainer}>
                    <div
                      className={styles.equipmentRowHeader}
                      style={{ backgroundColor: "var(--grey2)" }}
                    >
                      <div className={styles.equipmentRowName}>Name</div>
                      <div className={styles.equipmentRowQuantity}>Quantity</div>
                      <div className={styles.equipmentRowSingleuse}>Single Use</div>
                      <div className={styles.equipmentRowTrash}></div>
                    </div>
                  </div>
                </li>

                {mission?.equipmentItems?.map((item, index) => (
                  <li key={item.uuid} className={styles.equipmentListItem}>
                    <EquipmentItem
                      key={item.uuid}
                      item={item}
                      updateEquipmentItem={updateEquipmentItem}
                      deleteEquipmentItem={deleteEquipmentItem}
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
                  onClick={() => {
                    const equipmentItems = mission?.equipmentItems || [];
                    const newEquipmentItems = [...equipmentItems, blankEquipmentItem];
                    dispatch(setMission({ ...mission, equipmentItems: newEquipmentItems }));
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
  updateEquipmentItem: Function;
  deleteEquipmentItem: Function;
  editMode: boolean;
  evenRow: boolean;
}> = ({ item, updateEquipmentItem, deleteEquipmentItem, editMode, evenRow }) => {
  let backgroundColor: string = "var(--grey2)";
  if (!editMode) {
    backgroundColor = evenRow ? "var(--grey2)" : "var(--grey1)";
  }
  return (
    <div className={paneStyles.descriptionContainer}>
      <div className={styles.equipmentRow} style={{ backgroundColor }}>
        <div className={styles.equipmentRowName}>
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
              updateEquipmentItem({ ...item, name: val });
            }}
          />
        </div>
        <div className={styles.equipmentRowQuantity}>
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
              updateEquipmentItem({ ...item, quantity: toDecimal(val) });
            }}
          />
        </div>
        <div className={styles.equipmentRowSingleuse}>
          <div className={styles.equipmentRowSingleuseCheckbox}>
            {editMode ? (
              <Checkbox
                checked={item.singleUse}
                editable={editMode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  updateEquipmentItem({ ...item, singleUse: e.target.checked });
                }}
                toolTip={`Single-use item`}
              />
            ) : (
              <div>{item.singleUse ? "Yes" : ""}</div>
            )}
          </div>
        </div>
        <div className={styles.equipmentRowTrash}>
          {editMode && (
            <FontAwesomeIcon
              icon={faTrashAlt}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteEquipmentItem(item.uuid);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
