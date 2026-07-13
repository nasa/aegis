import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { generateBlankAction } from "store/storeUtils/action";
import { getAccurateNow } from "utils/formatting";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateUniqueName } from "utils/names/unique-name";

import { applyUpdatePoiByField } from "./apply-poi";
import { applyUpdateStationByField } from "./apply-station";
import { applyUpdateTraverseByField } from "./apply-traverse";

/**
 * Insert a new action into the doc draft and append its
 * uuid onto the parent entity's actionOrderUuids in the same atomic step.
 */
export function applyCreateAction(
  m: Mission,
  {
    actionParentUuid,
    actionTemplate,
  }: {
    actionParentUuid: ActionParentUuid;
    actionTemplate?: ActionTemplate;
  }
): string {
  const existingActions = Object.values(m.actions ?? {});

  const actionUuid = uuidv4();
  const randomName = generateUniqueName({
    dictName: "starTrek",
    existingNames: existingActions.map((a: Action) => a.name),
  });

  let blankAction = generateBlankAction({
    ...actionParentUuid,
    missionId: m.id,
    uuid: actionUuid,
    name: randomName,
    stmAction: m.actionSystemVersion === 2,
  });

  if (actionTemplate) {
    // Strip out the fields we don't want to copy into the new action
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { templateName, createdAt, updatedAt, ...rest } = actionTemplate;
    // cloneDeep because actionTemplate may be a live automerge proxy.
    blankAction = { ...blankAction, ...cloneDeep(rest) };
  }

  m.actions[blankAction.uuid] = blankAction;
  // Push the new uuid onto the live Automerge array of the parent entity
  // directly so the CRDT sees a per-element append. Initialize the array if
  // missing to guard against corrupted doc state.
  if (actionParentUuid.stationUuid) {
    const station = m.stations[actionParentUuid.stationUuid];
    if (station) {
      if (!station.actionOrderUuids) station.actionOrderUuids = [];
      station.actionOrderUuids.push(blankAction.uuid);
    }
  } else if (actionParentUuid.poiUuid) {
    const poi = m.pois[actionParentUuid.poiUuid];
    if (poi) {
      if (!poi.actionOrderUuids) poi.actionOrderUuids = [];
      poi.actionOrderUuids.push(blankAction.uuid);
    }
  } else if (actionParentUuid.traverseUuid) {
    const traverse = m.traverses[actionParentUuid.traverseUuid];
    if (traverse) {
      if (!traverse.actionOrderUuids) traverse.actionOrderUuids = [];
      traverse.actionOrderUuids.push(blankAction.uuid);
    }
  }

  return actionUuid;
}

/** Update a single action field. */
export function applyUpdateActionByField<K extends keyof Action>(
  m: Mission,
  {
    actionUuid,
    fieldName,
    value,
    preserveUpdatedAt = false,
  }: {
    actionUuid: string;
    fieldName: K;
    value: Action[K];
    preserveUpdatedAt?: boolean;
  }
): void {
  const action = m.actions[actionUuid];
  if (!action) return;
  action[fieldName] = cloneDeep(value);
  if (!preserveUpdatedAt) {
    action.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Update the actionDefinition selection (verb/noun/adjective uuid) on an Action.
 * Derives a new actionDefinition by spreading the existing one and setting the
 * relevant field based on the type, then delegates to applyUpdateActionByField.
 */
export function applyUpdateActionDefinitionSelection(
  m: Mission,
  {
    actionUuid,
    type,
    typeUuid,
  }: {
    actionUuid: string;
    type: ActionDefinitionType;
    typeUuid: string;
  }
): void {
  const action = m.actions[actionUuid];
  if (!action) return;

  const fieldMap: Record<ActionDefinitionType, keyof ActionDefinition> = {
    verbs: "verbUuid",
    nouns: "nounUuid",
    adjectives: "adjectiveUuid",
  };

  const newActionDefinition: ActionDefinition = {
    ...action.actionDefinition,
    [fieldMap[type]]: typeUuid,
  };

  applyUpdateActionByField(m, {
    actionUuid,
    fieldName: "actionDefinition",
    value: newActionDefinition,
  });
}

/** Delete a list of actions from the doc. */
export function applyDeleteActions(m: Mission, actionUuids: string[]): void {
  for (const uuid of actionUuids) {
    delete m.actions[uuid];
  }
}

/**
 * Delete an action and splice it out of its parent's
 * actionOrderUuids array in the same atomic step.
 */
export function applyDeleteActionAndUpdateParent(m: Mission, { uuid }: { uuid: string }): void {
  const action = m.actions?.[uuid];
  if (!action) return;

  if (action.stationUuid) {
    const actionOrderUuids = m.stations[action.stationUuid]?.actionOrderUuids;
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        actionOrderUuids.splice(actionIndex, 1);
      }
    }
  } else if (action.poiUuid) {
    const actionOrderUuids = m.pois[action.poiUuid]?.actionOrderUuids;
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        actionOrderUuids.splice(actionIndex, 1);
      }
    }
  } else if (action.traverseUuid) {
    const actionOrderUuids = m.traverses[action.traverseUuid]?.actionOrderUuids;
    if (actionOrderUuids) {
      const actionIndex = actionOrderUuids.findIndex((actionUuid) => actionUuid === uuid);
      if (actionIndex >= 0) {
        actionOrderUuids.splice(actionIndex, 1);
      }
    }
  }

  delete m.actions[uuid];
}

/**
 * Duplicate a list of actions for a new parent and append
 * them onto the parent's actionOrderUuids
 */
export function applyDuplicateActions(
  m: Mission,
  {
    actions,
    preserveRefUuid,
    stationUuid,
    poiUuid,
    traverseUuid,
    promotingFromPoi,
  }: {
    actions: Action[];
    preserveRefUuid: boolean;
    stationUuid?: string;
    poiUuid?: string;
    traverseUuid?: string;
    promotingFromPoi?: boolean;
  }
): void {
  if (!actions || actions.length === 0) return;

  const allActions = Object.values(m.actions ?? {});
  const stationActions = allActions.filter(
    (storeAction: Action) => storeAction.stationUuid === stationUuid
  );
  const poiActions = allActions.filter((storeAction: Action) => storeAction.poiUuid === poiUuid);
  const traverseActions = allActions.filter(
    (storeAction: Action) => storeAction.traverseUuid === traverseUuid
  );

  // Serialize through JSON to fully detach from any live Automerge proxies the
  // caller may have passed (e.g. when actions were filtered out of `m.actions`
  // earlier in the same .change() block). `cloneDeep` alone leaves residual
  // proxy linkage that causes "Cannot assign unknown object" errors on insert.
  const newActions: Action[] = JSON.parse(JSON.stringify(actions));
  // Set values for the duplicated actions.
  for (let i = 0; i < newActions.length; i++) {
    const newAction = newActions[i];
    newAction.uuid = uuidv4();
    newAction.stationUuid = stationUuid ?? null;
    newAction.poiUuid = poiUuid ?? null;
    newAction.traverseUuid = traverseUuid ?? null;

    // preservingRefUuids only occurs when duplicating an EVA for a REX.
    if (!preserveRefUuid) {
      newAction.refUuid = uuidv4();
      const newDateString = getAccurateNow().getTime();
      newAction.createdAt = newDateString;
      newAction.updatedAt = newDateString;
      if (stationUuid) {
        newAction.name = makeUniqueStringCopy(
          newAction.name,
          stationActions.map((a) => a.name)
        );
      } else if (poiUuid) {
        newAction.name = makeUniqueStringCopy(
          newAction.name,
          poiActions.map((a) => a.name)
        );
      } else if (traverseUuid) {
        newAction.name = makeUniqueStringCopy(
          newAction.name,
          traverseActions.map((a) => a.name)
        );
      }
    }

    // Set parent info
    if (promotingFromPoi) {
      newAction.parentActionUuid = actions[i].uuid;
      newAction.parentCopyDate = getAccurateNow().getTime();
    } else {
      newAction.parentActionUuid = actions[i].parentActionUuid;
      newAction.parentCopyDate = actions[i].parentCopyDate;
    }
  }

  // Append new actions onto the parent's actionOrderUuids.
  // NOTE: We read actionOrderUuids from the LIVE draft `m` here. Spread into a
  // plain array (instead of cloneDeep) because cloneDeep on an Automerge proxy
  // does not always yield a real Array — `.concat` and other methods may be
  // missing on the cloned value.
  if (stationUuid) {
    const station = m.stations?.[stationUuid];
    const actionOrderUuids = [
      ...(station?.actionOrderUuids ?? []),
      ...newActions.map((a) => a.uuid),
    ];
    applyUpdateStationByField(m, {
      stationUuid,
      fieldName: "actionOrderUuids",
      value: actionOrderUuids,
      preserveUpdatedAt: true,
    });
  } else if (poiUuid) {
    const poi = m.pois?.[poiUuid];
    const actionOrderUuids = [...(poi?.actionOrderUuids ?? []), ...newActions.map((a) => a.uuid)];
    applyUpdatePoiByField(m, {
      poiUuid,
      fieldName: "actionOrderUuids",
      value: actionOrderUuids,
      preserveUpdatedAt: true,
    });
  } else if (traverseUuid) {
    const traverse = m.traverses?.[traverseUuid];
    const actionOrderUuids = [
      ...(traverse?.actionOrderUuids ?? []),
      ...newActions.map((a) => a.uuid),
    ];
    applyUpdateTraverseByField(m, {
      traverseUuid,
      fieldName: "actionOrderUuids",
      value: actionOrderUuids,
      preserveUpdatedAt: true,
    });
  }

  // Insert new actions into the doc.
  for (const action of newActions) {
    m.actions[action.uuid] = action;
  }
}

/**
 * Add an equipment item to an action or action template.
 * No-ops if the item is already present.
 */
export function applyAddEquipmentItem(
  m: Mission,
  {
    actionUuid,
    actionTemplateUuid,
    equipmentItemUuid,
    quantity,
  }: {
    actionUuid?: string;
    actionTemplateUuid?: string;
    equipmentItemUuid: string;
    quantity: number;
  }
): void {
  if (actionTemplateUuid) {
    // Update action template
    const template = m.actionTemplates[actionTemplateUuid];
    if (!template) return;
    if (!template.equipmentItemsUsage) template.equipmentItemsUsage = {};
    if (template.equipmentItemsUsage[equipmentItemUuid]) return;
    template.equipmentItemsUsage[equipmentItemUuid] = { quantityUsed: quantity };
    template.updatedAt = getAccurateNow().getTime();
  } else if (actionUuid) {
    // Update a regular action
    const action = m.actions[actionUuid];
    if (!action) return;
    if (!action.equipmentItemsUsage) action.equipmentItemsUsage = {};
    if (action.equipmentItemsUsage[equipmentItemUuid]) return;
    action.equipmentItemsUsage[equipmentItemUuid] = { quantityUsed: quantity };
    action.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Remove an equipment item from an action or action template.
 */
export function applyRemoveEquipmentItem(
  m: Mission,
  {
    actionUuid,
    actionTemplateUuid,
    equipmentItemUuid,
  }: { actionUuid?: string; actionTemplateUuid?: string; equipmentItemUuid: string }
): void {
  if (actionTemplateUuid) {
    // Update action template
    const template = m.actionTemplates[actionTemplateUuid];
    if (!template?.equipmentItemsUsage?.[equipmentItemUuid]) return;
    delete template.equipmentItemsUsage[equipmentItemUuid];
    template.updatedAt = getAccurateNow().getTime();
  } else if (actionUuid) {
    // Update a regular action
    const action = m.actions[actionUuid];
    if (!action?.equipmentItemsUsage?.[equipmentItemUuid]) return;
    delete action.equipmentItemsUsage[equipmentItemUuid];
    action.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Add a geographic unit to an action or action template.
 * No-ops if the uuid is already present.
 */
export function applyAddGeographicUnit(
  m: Mission,
  {
    actionUuid,
    actionTemplateUuid,
    geographicUnitUuid,
  }: { actionUuid?: string; actionTemplateUuid?: string; geographicUnitUuid: string }
): void {
  if (actionTemplateUuid) {
    // Update action template
    const template = m.actionTemplates[actionTemplateUuid];
    if (!template) return;
    if (!template.geographicUnitsUsage) {
      template.geographicUnitsUsage = [geographicUnitUuid];
    } else {
      if (template.geographicUnitsUsage.some((u) => u === geographicUnitUuid)) return;
      template.geographicUnitsUsage.push(geographicUnitUuid);
    }
    template.updatedAt = getAccurateNow().getTime();
  } else if (actionUuid) {
    // Update a regular action
    const action = m.actions[actionUuid];
    if (!action) return;
    if (!action.geographicUnitsUsage) {
      action.geographicUnitsUsage = [geographicUnitUuid];
    } else {
      if (action.geographicUnitsUsage.some((u) => u === geographicUnitUuid)) return;
      action.geographicUnitsUsage.push(geographicUnitUuid);
    }
    action.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Remove a geographic unit from an action or action template.
 */
export function applyRemoveGeographicUnit(
  m: Mission,
  {
    actionUuid,
    actionTemplateUuid,
    geographicUnitUuid,
  }: { actionUuid?: string; actionTemplateUuid?: string; geographicUnitUuid: string }
): void {
  if (actionTemplateUuid) {
    const template = m.actionTemplates[actionTemplateUuid];
    if (!template?.geographicUnitsUsage) return;
    const indexToRemove = template.geographicUnitsUsage.findIndex((u) => u === geographicUnitUuid);
    if (indexToRemove >= 0) template.geographicUnitsUsage.splice(indexToRemove, 1);
    template.updatedAt = getAccurateNow().getTime();
  } else if (actionUuid) {
    const action = m.actions[actionUuid];
    if (!action?.geographicUnitsUsage) return;
    const indexToRemove = action.geographicUnitsUsage.findIndex((u) => u === geographicUnitUuid);
    if (indexToRemove >= 0) action.geographicUnitsUsage.splice(indexToRemove, 1);
    action.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Stage-based version of `applyDuplicateActions`
 * Distinct from `applyDuplicateActions` in that no name uniquification or
 * uuid generation happens here all of that work was already done by the
 * `stage*` builder against the doc mission.
 */
export function applyDuplicateActionsStage(m: Mission, stage: ActionsDuplicationStageData): void {
  // Set the parent's actionOrderUuids to the staged value. Using the existing
  // inner helpers preserves the per-entity update semantics.
  if (stage.parent.kind === "station") {
    applyUpdateStationByField(m, {
      stationUuid: stage.parent.stationUuid,
      fieldName: "actionOrderUuids",
      value: stage.newActionOrderUuids,
      preserveUpdatedAt: true,
    });
  } else if (stage.parent.kind === "poi") {
    applyUpdatePoiByField(m, {
      poiUuid: stage.parent.poiUuid,
      fieldName: "actionOrderUuids",
      value: stage.newActionOrderUuids,
      preserveUpdatedAt: true,
    });
  } else if (stage.parent.kind === "traverse") {
    applyUpdateTraverseByField(m, {
      traverseUuid: stage.parent.traverseUuid,
      fieldName: "actionOrderUuids",
      value: stage.newActionOrderUuids,
      preserveUpdatedAt: true,
    });
  }

  // Insert each cloned action.
  for (const item of stage.newActions) {
    m.actions[item.newUuid] = item.newAction;
  }
}
