import { faArrowsDownToLine, faArrowsUpToLine } from "@fortawesome/free-solid-svg-icons";

import { Button, Checkbox } from "components/interface/form/globalFields";
import { FunctionComponent, useCallback } from "react";
import paneStyles from "./global-pane-styles.module.css";
import actionStyles from "./actions-action.module.css";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { collapseActions, expandActions } from "store/action";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { useMissionDocSelector } from "utils/useDocSelector";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";

export const EquipmentSelector: FunctionComponent<{
  equipmentItemsUsage: EquipmentItemUsages | null;
  editMode: boolean;
  onChange?: (value: EquipmentItemUsages) => void; // onChange to execute when NOT using automerge
  actionTemplateUuid?: string; // for automerge. used if this component is being rendered in a mission actionTemplate
  uniqueId: string;
}> = ({ equipmentItemsUsage, editMode, onChange, actionTemplateUuid, uniqueId }) => {
  const automergeUrl = useAppSelector((state) => state.mission.automergeUrl, refEqual);
  const missionDocHandle = useDocHandle<Mission>(automergeUrl as AutomergeUrl);
  const equipmentItems = useMissionDocSelector((doc) => doc.equipmentItems, deepEqual);

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

  const addEquipmentItem = (equipmentItemUuid: string, quantity: number) => {
    if (actionTemplateUuid) {
      // Direct mutation approach for Automerge
      missionDocHandle.change((m: Mission) => {
        const template = m.actionTemplates[actionTemplateUuid];
        if (!template) return;
        if (!template.equipmentItemsUsage) template.equipmentItemsUsage = {};
        // if it already exists, do nothing, otherwise add it
        if (template.equipmentItemsUsage[equipmentItemUuid]) return;
        // Add new item
        template.equipmentItemsUsage[equipmentItemUuid] = { quantityUsed: quantity };
      });
    } else if (onChange) {
      // Fallback for non-Automerge usage
      const newEquipmentItemsUsage: EquipmentItemUsages = {
        ...equipmentItemsUsage,
        [equipmentItemUuid]: { quantityUsed: quantity },
      };
      onChange(newEquipmentItemsUsage);
    }
  };

  const removeEquipmentItem = useCallback(
    (equipmentItemUuid: string) => {
      if (actionTemplateUuid) {
        // Direct mutation approach for Automerge
        missionDocHandle.change((m: Mission) => {
          const template = m.actionTemplates[actionTemplateUuid];
          if (!template) return;
          if (template.equipmentItemsUsage[equipmentItemUuid]) {
            delete template.equipmentItemsUsage[equipmentItemUuid];
          }
        });
      } else if (onChange && equipmentItemsUsage) {
        // Fallback for non-Automerge usage
        const updatedEquipmentItemsUsage = { ...equipmentItemsUsage };
        delete updatedEquipmentItemsUsage?.[equipmentItemUuid];
        onChange(updatedEquipmentItemsUsage);
      }
    },
    [actionTemplateUuid, missionDocHandle, onChange, equipmentItemsUsage]
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
  onChange?: (value: string[]) => void; // onChange to execute when not using automerge
  actionTemplateUuid?: string; // for automerge. used if this component is being rendered in a mission actionTemplate
  uniqueId: string;
}> = ({ geographicUnitsUsage, editMode, onChange, actionTemplateUuid, uniqueId }) => {
  const automergeUrl = useAppSelector((state) => state.mission.automergeUrl, refEqual);
  const missionDocHandle = useDocHandle<Mission>(automergeUrl as AutomergeUrl);
  const geographicUnits = useMissionDocSelector((doc) => doc.geographicUnits, deepEqual);

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

  const addGeographicUnit = (geographicUnitUuid: string) => {
    if (actionTemplateUuid) {
      // Direct mutation approach for Automerge
      missionDocHandle.change((m: Mission) => {
        const template = m.actionTemplates[actionTemplateUuid];
        if (!template) return;
        if (geographicUnitsUsage) {
          // if it already exists, do nothing, otherwise add it
          const exists = geographicUnitsUsage.some(
            (geoUnitUuid) => geoUnitUuid === geographicUnitUuid
          );
          if (exists) return;
          template.geographicUnitsUsage.push(geographicUnitUuid); // Add new uuid
        } else {
          template.geographicUnitsUsage = [geographicUnitUuid];
        }
      });
    } else if (onChange) {
      // Fallback for non-Automerge usage
      let newGeographicUnitsUsage: string[] = [];
      if (geographicUnitsUsage) {
        // remove any existing geographic unit with the same uuid
        newGeographicUnitsUsage = geographicUnitsUsage.filter(
          (uuid) => uuid !== geographicUnitUuid
        );

        newGeographicUnitsUsage = [...newGeographicUnitsUsage, geographicUnitUuid];
      } else {
        newGeographicUnitsUsage = [geographicUnitUuid];
      }
      onChange(newGeographicUnitsUsage);
    }
  };

  const removeNewGeographicUnit = useCallback(
    (geographicUnitUuid: string) => {
      if (actionTemplateUuid) {
        // Direct mutation approach for Automerge
        missionDocHandle.change((m: Mission) => {
          const template = m.actionTemplates[actionTemplateUuid];
          if (!template) return;
          const indexToRemove = template.geographicUnitsUsage.findIndex(
            (uuid) => uuid === geographicUnitUuid
          );
          if (indexToRemove >= 0) {
            template.geographicUnitsUsage.splice(indexToRemove, 1);
          }
        });
      } else if (onChange && geographicUnitsUsage) {
        // Fallback for non-Automerge usage
        const newGeographicUnitsUsage = geographicUnitsUsage.filter(
          (geographicUnitUsage) => geographicUnitUsage !== geographicUnitUuid
        );
        onChange(newGeographicUnitsUsage);
      }
    },
    [actionTemplateUuid, missionDocHandle, onChange, geographicUnitsUsage]
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
