import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";
import { getActionDefinitionLabel } from "store/selectors";

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
    name: `(${getActionDefinitionLabel(m, type)} Name)`,
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

/**
 * Set a custom singular/plural label for an action-definition category (verb/noun/adjective).
 */
export function applyUpdateActionDefinitionLabel(
  m: Mission,
  {
    type,
    form,
    value,
  }: {
    type: "verb" | "noun" | "adjective";
    form: "singular" | "plural";
    value: string;
  }
): void {
  m.actionDefinitionLabels[type][form] = value;
  m.updatedAt = getAccurateNow().getTime();
}

/**
 * Set a custom conjunction used in the action sentence "<verb> of <noun> in <adjective>".
 */
export function applyUpdateActionDefinitionConjunction(
  m: Mission,
  {
    key,
    value,
  }: {
    key: "verbToNoun" | "nounToAdjective";
    value: string;
  }
): void {
  m.actionDefinitionConjunctions[key] = value;
  m.updatedAt = getAccurateNow().getTime();
}
