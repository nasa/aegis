import capitalize from "lodash/capitalize";
import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Insert a new blank ActionDefinitionItem of the given type into the Mission draft.
 * Returns the newly-allocated uuid.
 */
export function applyCreateActionDefinitionItem(
  m: Mission,
  { type }: { type: ActionDefinitionType }
): string {
  const newUuid = uuidv4();
  const blankItem: ActionDefinitionItem = {
    name: `(${capitalize(type.slice(0, -1))} Name)`,
    abbr: "abbr",
  };

  m.actionDefinitions[type][newUuid] = blankItem;
  m.updatedAt = getAccurateNow().getTime();

  return newUuid;
}

/**
 * Update a single field on an ActionDefinitionItem in the Mission draft.
 */
export function applyUpdateActionDefinitionItemByField<K extends keyof ActionDefinitionItem>(
  m: Mission,
  {
    type,
    uuid,
    fieldName,
    value,
  }: {
    type: ActionDefinitionType;
    uuid: string;
    fieldName: K;
    value: ActionDefinitionItem[K];
  }
): void {
  const actionDefinitionItem = m.actionDefinitions?.[type]?.[uuid];
  if (actionDefinitionItem) {
    actionDefinitionItem[fieldName] = cloneDeep(value);
    m.updatedAt = getAccurateNow().getTime();
  }
}
