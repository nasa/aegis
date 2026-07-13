import { faArrowsDownToLine, faArrowsUpToLine } from "@fortawesome/free-solid-svg-icons";

import { Button, Checkbox } from "components/interface/form/globalFields";
import type { FunctionComponent } from "react";
import { useCallback } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual } from "utils/useAppSelector";
import { collapseActions, expandActions } from "store/action";
import { useMissionDocSelector } from "utils/useDocSelector";
import { withMissionChange } from "client/automergeDocHandles";
import {
  applyAddEquipmentItem,
  applyRemoveEquipmentItem,
  applyAddGeographicUnit,
  applyRemoveGeographicUnit,
} from "client/automerge/apply/apply-action";

export const EquipmentSelector: FunctionComponent<{
  equipmentItemsUsage: EquipmentItemUsages | null;
  editMode: boolean;
  actionUuid?: string; // component is being rendered in the action body of an action
  actionTemplateUuid?: string; // component is being rendered in a mission actionTemplate
  uniqueId: string;
}> = ({ equipmentItemsUsage, editMode, actionUuid, actionTemplateUuid, uniqueId }) => {
  const equipmentItems = useMissionDocSelector((mission) => mission.equipmentItems, deepEqual);

  const sortedEquipmentItems: [string, EquipmentItem][] = !equipmentItems
    ? []
    : Object.entries(equipmentItems).sort(([, a], [, b]) => a.name.localeCompare(b.name));

  // create sorted list of equipment item display objects. Used to show the list when not in edit mode
  const equipmentItemUsageDisplayList = sortedEquipmentItems.flatMap(
    ([uuid, equipmentItem]): EquipmentItemDisplay | [] => {
      if (equipmentItemsUsage?.[uuid]) {
        return {
          name: equipmentItem?.name ? equipmentItem.name : "",
          quantityUsed: equipmentItemsUsage?.[uuid]?.quantityUsed || 0,
        } as EquipmentItemDisplay;
      } else {
        return [];
      }
    }
  );

  const addEquipmentItem = useCallback(
    (equipmentItemUuid: string, quantity: number) => {
      withMissionChange((m) =>
        applyAddEquipmentItem(m, { actionUuid, actionTemplateUuid, equipmentItemUuid, quantity })
      );
    },
    [actionTemplateUuid, actionUuid]
  );

  const removeEquipmentItem = useCallback(
    (equipmentItemUuid: string) => {
      withMissionChange((m) =>
        applyRemoveEquipmentItem(m, { actionUuid, actionTemplateUuid, equipmentItemUuid })
      );
    },
    [actionTemplateUuid, actionUuid]
  );

  if (editMode) {
    // split equipment items into two columns
    const equipmentItemsColumn1 = sortedEquipmentItems?.slice(
      0,
      Math.ceil(sortedEquipmentItems.length / 2)
    );
    const equipmentItemsColumn2 = sortedEquipmentItems?.slice(
      Math.ceil(sortedEquipmentItems.length / 2)
    );

    return (
      <div className={actionStyles.propertyListDoubleColumn}>
        <div className={actionStyles.propertyListColumn}>
          {equipmentItemsColumn1 &&
            equipmentItemsColumn1.map(([uuid, equipmentItem]) => {
              return EquipmentCheckbox({
                equipmentItemsUsage,
                editMode,
                equipmentItemUuid: uuid,
                equipmentItem,
                addEquipmentItem,
                removeEquipmentItem,
                uniqueId,
              });
            })}
        </div>
        <div className={paneStyles.propertyListColumn}>
          {equipmentItemsColumn2 &&
            equipmentItemsColumn2.map(([uuid, equipmentItem]) => {
              return EquipmentCheckbox({
                equipmentItemsUsage,
                editMode,
                equipmentItemUuid: uuid,
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
        {equipmentItemUsageDisplayList?.map((equipmentItemDisplay, index) => {
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
  equipmentItemsUsage: EquipmentItemUsages | null;
  editMode: boolean;
  equipmentItemUuid: string;
  equipmentItem: EquipmentItem;
  addEquipmentItem: (equipmentItemUuid: string, quantity: number) => void;
  removeEquipmentItem: (equipmentItemUuid: string) => void;
  uniqueId: string;
}> = ({
  equipmentItemsUsage,
  editMode,
  equipmentItemUuid,
  equipmentItem,
  addEquipmentItem,
  removeEquipmentItem,
  uniqueId,
}) => {
  // return true if equipmentItem.uuid is in action's equipmentItemsUsage
  const checked = equipmentItemsUsage?.[equipmentItemUuid] !== undefined;

  return (
    <div key={equipmentItemUuid} className={actionStyles.propertyItem}>
      <Checkbox
        checked={checked}
        editable={editMode}
        onChange={(e) => {
          if (e.target.checked) {
            addEquipmentItem(equipmentItemUuid, 1);
          } else {
            removeEquipmentItem(equipmentItemUuid);
          }
        }}
        label={equipmentItem?.name}
        labelStyle={{ justifyContent: "space-around", display: "flex", flexDirection: "column" }}
        uniqueId={`${equipmentItemUuid}-${uniqueId}`}
      />
    </div>
  );
};

export const GeographicUnitSelector: FunctionComponent<{
  geographicUnitsUsage: string[] | null;
  editMode: boolean;
  actionUuid?: string; // component is being rendered in the action body of an action
  actionTemplateUuid?: string; // component is being rendered in a mission actionTemplate
  uniqueId: string;
}> = ({ geographicUnitsUsage, editMode, actionUuid, actionTemplateUuid, uniqueId }) => {
  const geographicUnits = useMissionDocSelector((mission) => mission.geographicUnits, deepEqual);

  const sortedGeographicUnits: [string, GeographicUnit][] = !geographicUnits
    ? []
    : Object.entries(geographicUnits).sort(([, a], [, b]) => a.name.localeCompare(b.name));

  // create sorted list of geographic units. Used to show the list when not in edit mode
  const geographicUnitDisplayList = sortedGeographicUnits.flatMap(
    ([uuid, geographicUnit]): string | [] => {
      if (geographicUnitsUsage?.includes(uuid)) {
        return geographicUnit?.name ? geographicUnit.name : "";
      } else {
        return [];
      }
    }
  );

  const addGeographicUnit = useCallback(
    (geographicUnitUuid: string) => {
      withMissionChange((m) =>
        applyAddGeographicUnit(m, { actionUuid, actionTemplateUuid, geographicUnitUuid })
      );
    },
    [actionTemplateUuid, actionUuid]
  );

  const removeNewGeographicUnit = useCallback(
    (geographicUnitUuid: string) => {
      withMissionChange((m) =>
        applyRemoveGeographicUnit(m, { actionUuid, actionTemplateUuid, geographicUnitUuid })
      );
    },
    [actionTemplateUuid, actionUuid]
  );

  if (editMode) {
    // split equipment items into two columns
    const geographicUnitsColumn1 = sortedGeographicUnits?.slice(
      0,
      Math.ceil(sortedGeographicUnits.length / 2)
    );
    const geographicUnitsColumn2 = sortedGeographicUnits?.slice(
      Math.ceil(sortedGeographicUnits.length / 2)
    );

    return (
      <div className={actionStyles.propertyListDoubleColumn}>
        <div className={actionStyles.propertyListColumn}>
          {geographicUnitsColumn1 &&
            geographicUnitsColumn1.map(([uuid, geographicUnit]) => {
              return GeographicUnitCheckbox({
                geographicUnitsUsage,
                editMode,
                geographicUnitUuid: uuid,
                geographicUnit,
                addGeographicUnit: addGeographicUnit,
                removeGeographicUnit: removeNewGeographicUnit,
                uniqueId,
              });
            })}
        </div>
        <div className={paneStyles.propertyListColumn}>
          {geographicUnitsColumn2 &&
            geographicUnitsColumn2.map(([uuid, geographicUnit]) => {
              return GeographicUnitCheckbox({
                geographicUnitsUsage,
                editMode,
                geographicUnitUuid: uuid,
                geographicUnit,
                addGeographicUnit: addGeographicUnit,
                removeGeographicUnit: removeNewGeographicUnit,
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
  geographicUnitsUsage: string[] | null;
  editMode: boolean;
  geographicUnitUuid: string;
  geographicUnit: GeographicUnit;
  addGeographicUnit: (geographicUnitUuid: string) => void;
  removeGeographicUnit: (geographicUnitUuid: string) => void;
  uniqueId: string;
}> = ({
  geographicUnitsUsage,
  editMode,
  geographicUnitUuid,
  geographicUnit,
  addGeographicUnit,
  removeGeographicUnit,
  uniqueId,
}) => {
  // return true if geographicUnit.uuid is in action.geographicUnits
  let checked = false;
  if (geographicUnitsUsage) {
    checked = geographicUnitsUsage.some(
      (geographicUnitUsage) => geographicUnitUsage === geographicUnitUuid
    );
  }

  return (
    <div key={geographicUnitUuid} className={actionStyles.propertyItem}>
      <Checkbox
        checked={checked}
        editable={editMode}
        onChange={(e) => {
          if (e.target.checked) {
            addGeographicUnit(geographicUnitUuid);
          } else {
            removeGeographicUnit(geographicUnitUuid);
          }
        }}
        label={geographicUnit.name}
        labelStyle={{ justifyContent: "space-around", display: "flex", flexDirection: "column" }}
        uniqueId={`${geographicUnitUuid}-${uniqueId}`}
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
        ariaLabel="Expand All Button"
        style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
      />
      <Button
        icon={faArrowsUpToLine}
        onClick={() => {
          dispatch(collapseActions(actionUuids));
        }}
        toolTip="Collapse all actions"
        ariaLabel="Collapse All Button"
        style={{ width: "30px", fontSize: "0.8em", paddingLeft: "8px" }}
      />
    </div>
  );
};
