import { faArrowsDownToLine, faArrowsUpToLine } from "@fortawesome/free-solid-svg-icons";

import { Button, Checkbox } from "components/interface/form/globalFields";
import { FunctionComponent, useCallback, useState, useEffect } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import { RootState } from "store";
import _ from "lodash";
import { collapseActions, expandActions } from "store/interface";

export const EquipmentSelector: FunctionComponent<{
  equipmentItemsUsage: EquipmentItemUsage[];
  editMode: boolean;
  onChange: (value: EquipmentItemUsage[]) => void;
  uniqueId: string;
}> = ({ equipmentItemsUsage, editMode, onChange, uniqueId }) => {
  const equipmentItems = useAppSelector(
    (state) => state.mission.mission.equipmentItems,
    shallowEqual
  );

  const [equipmentItemDisplayList, setEquipmentItemDisplayList] = useState<EquipmentItemDisplay[]>(
    []
  );

  // create sorted list of equipment item display objects. Used to show the list when not in edit mode
  useEffect(() => {
    const newEquipmentItemDisplayList = equipmentItemsUsage?.map((equipmentItemUsage) => {
      const equipmentItem = equipmentItems?.find(
        (equipmentItem) => equipmentItem.uuid === equipmentItemUsage.uuid
      );
      return {
        name: equipmentItem?.name ? equipmentItem.name : "",
        quantityUsed: equipmentItemUsage?.quantityUsed,
      } as EquipmentItemDisplay;
    });

    // sort by name
    newEquipmentItemDisplayList?.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    setEquipmentItemDisplayList(newEquipmentItemDisplayList);
  }, [equipmentItemsUsage, equipmentItems]);

  const addEquipmentItem = (equipmentItemUuid: string, quantity: number) => {
    const newEquipmentItemUsage: EquipmentItemUsage = {
      uuid: equipmentItemUuid,
      quantityUsed: quantity,
    };

    let newEquipmentItemsUsage: EquipmentItemUsage[] = [];
    if (equipmentItemsUsage) {
      // remove any existing equipment item usage with the same uuid
      newEquipmentItemsUsage = equipmentItemsUsage.filter(
        (equipmentItemUsage) => equipmentItemUsage.uuid !== equipmentItemUuid
      );

      newEquipmentItemsUsage = [...newEquipmentItemsUsage, newEquipmentItemUsage];
    } else {
      newEquipmentItemsUsage = [newEquipmentItemUsage];
    }
    onChange(newEquipmentItemsUsage);
  };

  const removeEquipmentItem = useCallback(
    (equipmentItemUuid: string) => {
      const newEquipmentItemsUsage = equipmentItemsUsage.filter(
        (equipmentItemUsage) => equipmentItemUsage.uuid !== equipmentItemUuid
      );
      onChange(newEquipmentItemsUsage);
    },
    [equipmentItemsUsage, onChange]
  );

  if (editMode) {
    // split equipment items into two columns
    const equipmentItemsColumn1 = equipmentItems?.slice(0, Math.ceil(equipmentItems.length / 2));
    const equipmentItemsColumn2 = equipmentItems?.slice(Math.ceil(equipmentItems.length / 2));

    return (
      <div className={actionStyles.propertyListDoubleColumn}>
        <div className={actionStyles.propertyListColumn}>
          {equipmentItemsColumn1 &&
            equipmentItemsColumn1.map((equipmentItem) => {
              return EquipmentCheckbox({
                equipmentItemsUsage,
                editMode,
                equipmentItem,
                addEquipmentItem,
                removeEquipmentItem,
                uniqueId,
              });
            })}
        </div>
        <div className={paneStyles.propertyListColumn}>
          {equipmentItemsColumn2 &&
            equipmentItemsColumn2.map((equipmentItem) => {
              return EquipmentCheckbox({
                equipmentItemsUsage,
                editMode,
                equipmentItem,
                addEquipmentItem,
                removeEquipmentItem,
                uniqueId,
              });
            })}
        </div>
      </div>
    );
  } else {
    return (
      <div className={actionStyles.propertyList}>
        {equipmentItemDisplayList?.map((equipmentItemDisplay, index) => {
          return (
            <div
              key={`${equipmentItemDisplay.name}${index}`}
              className={actionStyles.propertyItemLabel}
            >
              {equipmentItemDisplay.name}
              {equipmentItemDisplay.quantityUsed > 1
                ? `(${equipmentItemDisplay.quantityUsed})`
                : null}
            </div>
          );
        })}
      </div>
    );
  }
};

const EquipmentCheckbox: FunctionComponent<{
  equipmentItemsUsage: EquipmentItemUsage[];
  editMode: boolean;
  equipmentItem: EquipmentItem;
  addEquipmentItem: (equipmentItemUuid: string, quantity: number) => void;
  removeEquipmentItem: (equipmentItemUuid: string) => void;
  uniqueId: string;
}> = ({
  equipmentItemsUsage,
  editMode,
  equipmentItem,
  addEquipmentItem,
  removeEquipmentItem,
  uniqueId,
}) => {
  // return true if equipmentItem.uuid is in action's equipmentItemsUsage
  let checked = false;
  if (equipmentItemsUsage) {
    checked = equipmentItemsUsage.some(
      (equipmentItemUsage) => equipmentItemUsage.uuid === equipmentItem.uuid
    );
  }

  return (
    <div key={equipmentItem.uuid} className={actionStyles.propertyItem}>
      <Checkbox
        checked={checked}
        editable={editMode}
        onChange={(e) => {
          if (e.target.checked) {
            addEquipmentItem(equipmentItem.uuid, 1);
          } else {
            removeEquipmentItem(equipmentItem.uuid);
          }
        }}
        label={equipmentItem?.name}
        labelStyle={{ justifyContent: "space-around", display: "flex", flexDirection: "column" }}
        uniqueId={`${equipmentItem?.name}-${uniqueId}`}
      />
    </div>
  );
};

export const GeographicUnitSelector: FunctionComponent<{
  geographicUnitsUsage: string[];
  editMode: boolean;
  onChange: (value: string[]) => void;
  uniqueId: string;
}> = ({ geographicUnitsUsage, editMode, onChange, uniqueId }) => {
  const geographicUnits = useAppSelector(
    (state: RootState) => state.mission.mission.geographicUnits,
    refEqual
  );

  const [geographicUnitDisplayList, setGeographicUnitDisplayList] = useState<string[]>([]);

  // create sorted list of geographic units. Used to show the list when not in edit mode
  useEffect(() => {
    const newGeographicUnitDisplayList = geographicUnitsUsage?.map((geographicUnitUuid) => {
      const geographicUnit = geographicUnits?.find(
        (geographicUnit) => geographicUnit.uuid === geographicUnitUuid
      );
      return geographicUnit?.name;
    });

    // sort by name
    newGeographicUnitDisplayList?.sort((a, b) => {
      return a.localeCompare(b);
    });

    setGeographicUnitDisplayList(newGeographicUnitDisplayList);
  }, [geographicUnitsUsage, geographicUnits]);

  const addGeographicUnit = (geographicUnitUuid: string) => {
    let newGeographicUnitsUsage: string[] = [];
    if (geographicUnitsUsage) {
      // remove any existing geographic unit with the same uuid
      newGeographicUnitsUsage = geographicUnitsUsage.filter((uuid) => uuid !== geographicUnitUuid);

      newGeographicUnitsUsage = [...newGeographicUnitsUsage, geographicUnitUuid];
    } else {
      newGeographicUnitsUsage = [geographicUnitUuid];
    }
    onChange(newGeographicUnitsUsage);
  };

  const removenewGeographicUnit = useCallback(
    (geographicUnitUuid: string) => {
      const newGeographicUnitsUsage = geographicUnitsUsage.filter(
        (geographicUnitUsage) => geographicUnitUsage !== geographicUnitUuid
      );
      onChange(newGeographicUnitsUsage);
    },
    [geographicUnitsUsage, onChange]
  );

  if (editMode) {
    // split equipment items into two columns
    const geographicUnitsColumn1 = geographicUnits?.slice(0, Math.ceil(geographicUnits.length / 2));
    const geographicUnitsColumn2 = geographicUnits?.slice(Math.ceil(geographicUnits.length / 2));

    return (
      <div className={actionStyles.propertyListDoubleColumn}>
        <div className={actionStyles.propertyListColumn}>
          {geographicUnitsColumn1 &&
            geographicUnitsColumn1.map((geographicUnit) => {
              return GeographicUnitCheckbox({
                geographicUnitsUsage,
                editMode,
                geographicUnit,
                addgeographicUnit: addGeographicUnit,
                removegeographicUnit: removenewGeographicUnit,
                uniqueId,
              });
            })}
        </div>
        <div className={paneStyles.propertyListColumn}>
          {geographicUnitsColumn2 &&
            geographicUnitsColumn2.map((geographicUnit) => {
              return GeographicUnitCheckbox({
                geographicUnitsUsage,
                editMode,
                geographicUnit,
                addgeographicUnit: addGeographicUnit,
                removegeographicUnit: removenewGeographicUnit,
                uniqueId,
              });
            })}
        </div>
      </div>
    );
  } else {
    return (
      <div className={actionStyles.propertyList}>
        {geographicUnitDisplayList?.map((geographicUnitDisplay, index) => {
          return (
            <div
              key={`${geographicUnitDisplay}${index}`}
              className={actionStyles.propertyItemLabel}
            >
              {geographicUnitDisplay}
            </div>
          );
        })}
      </div>
    );
  }
};

const GeographicUnitCheckbox: FunctionComponent<{
  geographicUnitsUsage: string[];
  editMode: boolean;
  geographicUnit: GeographicUnit;
  addgeographicUnit: (geographicUnitUuid: string, quantity: number) => void;
  removegeographicUnit: (geographicUnitUuid: string) => void;
  uniqueId: string;
}> = ({
  geographicUnitsUsage,
  editMode,
  geographicUnit,
  addgeographicUnit,
  removegeographicUnit,
  uniqueId,
}) => {
  // return true if geographicUnit.uuid is in action.geographicUnits
  let checked = false;
  if (geographicUnitsUsage) {
    checked = geographicUnitsUsage.some(
      (geographicUnitUsage) => geographicUnitUsage === geographicUnit.uuid
    );
  }

  return (
    <div key={geographicUnit.uuid} className={actionStyles.propertyItem}>
      <Checkbox
        checked={checked}
        editable={editMode}
        onChange={(e) => {
          if (e.target.checked) {
            addgeographicUnit(geographicUnit.uuid, 1);
          } else {
            removegeographicUnit(geographicUnit.uuid);
          }
        }}
        label={geographicUnit.name}
        labelStyle={{ justifyContent: "space-around", display: "flex", flexDirection: "column" }}
        uniqueId={`${geographicUnit.name}-${uniqueId}`}
      />
    </div>
  );
};

export const ExpandCollapseActionsButtons: FunctionComponent<{ actionUuids: string[] }> = ({
  actionUuids,
}) => {
  const dispatch = useAppDispatch();

  return (
    <div className={paneStyles.rightBodyTitleIcons}>
      <Button
        icon={faArrowsDownToLine}
        onClick={() => {
          dispatch(expandActions(actionUuids));
        }}
        toolTip="Expand all actions"
        style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
      />
      <Button
        icon={faArrowsUpToLine}
        onClick={() => {
          dispatch(collapseActions(actionUuids));
        }}
        toolTip="Collapse all actions"
        style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
      />
    </div>
  );
};
