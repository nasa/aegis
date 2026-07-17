import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { getAccurateNow } from "utils/formatting";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateUniqueName } from "utils/names/unique-name";

/**
 * Insert a new blank ActionTemplate into the Mission draft.
 * Generates a unique random animal name.
 * Returns the newly-allocated uuid.
 */
export function applyCreateActionTemplate(m: Mission): string {
  const newUuid = uuidv4();

  const existingNames = Object.entries(m.actionTemplates).map(([_, at]) => at.templateName);
  const randomName = generateUniqueName({
    dictName: "animals",
    existingNames: existingNames || [],
  });
  const blankActionTemplate: ActionTemplate = generateBlankActionTemplate({
    templateName: randomName,
  });

  m.actionTemplates[newUuid] = blankActionTemplate;
  m.updatedAt = getAccurateNow().getTime();

  return newUuid;
}

/**
 * Delete an ActionTemplate from the Mission draft.
 */
export function applyDeleteActionTemplate(
  m: Mission,
  { actionTemplateUuid }: { actionTemplateUuid: string }
): void {
  if (m.actionTemplates?.[actionTemplateUuid]) {
    delete m.actionTemplates?.[actionTemplateUuid];
    m.updatedAt = getAccurateNow().getTime();
  }
}

// Update a top-level field: applyUpdateActionTemplateByField(m, { actionTemplateUuid, fieldName: "templateName", value })
export function applyUpdateActionTemplateByField<K extends keyof ActionTemplate>(
  m: Mission,
  params: {
    actionTemplateUuid: string;
    fieldName: K;
    value: ActionTemplate[K];
  }
): void;

// Update a nested map field: applyUpdateActionTemplateByField(m, { actionTemplateUuid, fieldName: "actions", mapKey, mapValue })
export function applyUpdateActionTemplateByField<
  K extends keyof ActionTemplate,
  MapKey extends keyof NonNullable<ActionTemplate[K]>,
>(
  m: Mission,
  params: {
    actionTemplateUuid: string;
    fieldName: K;
    mapKey: MapKey;
    mapValue: NonNullable<ActionTemplate[K]>[MapKey];
  }
): void;

export function applyUpdateActionTemplateByField<
  K extends keyof ActionTemplate,
  MapKey extends keyof NonNullable<ActionTemplate[K]>,
>(
  m: Mission,
  params: {
    actionTemplateUuid: string;
    fieldName: K;
    value?: ActionTemplate[K];
    mapKey?: MapKey;
    mapValue?: NonNullable<ActionTemplate[K]>[MapKey];
  }
): void {
  const { actionTemplateUuid, fieldName, value, mapKey, mapValue } = params;
  const updatedAtTime = getAccurateNow().getTime();
  const actionTemplate = m.actionTemplates?.[actionTemplateUuid];
  if (actionTemplate) {
    if (mapKey !== undefined) {
      const map = actionTemplate[fieldName] as NonNullable<ActionTemplate[K]>;
      map[mapKey] = cloneDeep(mapValue) as NonNullable<ActionTemplate[K]>[MapKey];
    } else {
      actionTemplate[fieldName] = cloneDeep(value) as ActionTemplate[K];
    }
    actionTemplate.updatedAt = updatedAtTime;
    m.updatedAt = updatedAtTime;
  }
}

/**
 * Duplicate an existing ActionTemplate in the Mission draft.
 * Generates a unique name based on the original.
 * Returns the newly-allocated uuid.
 */
export function applyDuplicateActionTemplate(
  m: Mission,
  { actionTemplateUuid }: { actionTemplateUuid: string }
): string {
  const newActionTemplateUuid = uuidv4();
  const modelTemplate = m.actionTemplates[actionTemplateUuid];
  if (!modelTemplate) return newActionTemplateUuid;

  // Convert to plain object to avoid Automerge reference issues when using spread
  const plainTemplate = JSON.parse(JSON.stringify(modelTemplate));

  const duplicatedActionTemplate: ActionTemplate = {
    ...plainTemplate,
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
    templateName: makeUniqueStringCopy(
      modelTemplate.templateName || "",
      Object.entries(m.actionTemplates).map(([_, at]) => at.templateName) || []
    ),
  };

  m.actionTemplates[newActionTemplateUuid] = duplicatedActionTemplate;
  m.updatedAt = getAccurateNow().getTime();

  return newActionTemplateUuid;
}

/**
 * Update the actionDefinition reference (verb/noun/adjective uuid) on an ActionTemplate.
 */
export function applyUpdateActionTemplateActionDefinition(
  m: Mission,
  {
    actionTemplateUuid,
    type,
    uuid,
  }: {
    actionTemplateUuid: string;
    type: keyof ActionDefinition;
    uuid: string;
  }
): void {
  const actionTemplate = m.actionTemplates?.[actionTemplateUuid];
  if (actionTemplate) {
    if (!actionTemplate.actionDefinition) {
      actionTemplate.actionDefinition = {
        verbUuid: "",
        nounUuid: "",
        adjectiveUuid: "",
      };
    }
    actionTemplate.actionDefinition[type] = uuid;
    actionTemplate.updatedAt = getAccurateNow().getTime();
    m.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Create a new ActionTemplate from an existing action in the Mission draft.
 * Reads the action from `m.actions` (no doc handle needed).
 * Returns the newly-allocated uuid.
 */
export function applyCreateTemplateFromAction(
  m: Mission,
  { actionUuid }: { actionUuid: string }
): string {
  const actionToClone = m.actions?.[actionUuid];
  if (!actionToClone) return "";

  // JSON round-trip to detach from the Automerge proxy before spreading
  const action = JSON.parse(JSON.stringify(actionToClone));

  const newActionTemplateUuid = uuidv4();
  const newActionTemplate: ActionTemplate = {
    templateName: `Template of ${action.name}`,
    name: action.name,
    actionDefinition: action.actionDefinition,
    icon: action.icon,
    description: action.description,
    descriptionTask: action.descriptionTask,
    status: action.status,
    type: action.type,
    duration: action.duration,
    stmAction: action.stmAction,
    stmPriorities: action.stmPriorities,
    equipmentItemsUsage: action.equipmentItemsUsage,
    geographicUnitsUsage: action.geographicUnitsUsage,
    crewAssigned: action.crewAssigned,
    mass: action.mass,
    priority: action.priority,
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };

  if (newActionTemplate.stmAction) {
    // update template name to noun/verb/adj name
    const nounName =
      m.actionDefinitions?.nouns?.[newActionTemplate.actionDefinition?.nounUuid || ""]?.name;
    const verbName =
      m.actionDefinitions?.verbs?.[newActionTemplate.actionDefinition?.verbUuid || ""]?.name;
    const adjName =
      m.actionDefinitions?.adjectives?.[newActionTemplate.actionDefinition?.adjectiveUuid || ""]
        ?.name;

    newActionTemplate.templateName =
      `Template of ${verbName || "Verb"} of ${nounName || "Noun"} in ${adjName || "Adj"} `.trim();
  }

  m.actionTemplates[newActionTemplateUuid] = newActionTemplate;
  m.updatedAt = getAccurateNow().getTime();

  return newActionTemplateUuid;
}
