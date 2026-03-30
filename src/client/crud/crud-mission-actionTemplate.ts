import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { getAccurateNow } from "utils/formatting";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import { ConsoleLogger as clientLogger } from "utils/logging/clientLogger";

export const crudCreateActionTemplate = (): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;

  const newUuid = uuidv4();
  missionDocHandle.change((m: Mission) => {
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
  });
};

export const crudDeleteActionTemplate = (actionTemplateUuid: string): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  missionDocHandle.change((m: Mission) => {
    if (m.actionTemplates?.[actionTemplateUuid]) {
      delete m.actionTemplates?.[actionTemplateUuid];
      m.updatedAt = getAccurateNow().getTime();
    }
  });
};

// Update a top-level field: crudUpdateActionTemplateByField(uuid, "templateName", value)
export function crudUpdateActionTemplateByField<K extends keyof ActionTemplate>(
  actionTemplateUuid: string,
  fieldName: K,
  value: ActionTemplate[K]
): void;

// Update a nested map field: crudUpdateActionTemplateByField(uuid, "actions", actionUuid, actionValue)
export function crudUpdateActionTemplateByField<
  K extends keyof ActionTemplate,
  MapKey extends keyof NonNullable<ActionTemplate[K]>,
>(
  actionTemplateUuid: string,
  mapFieldName: K,
  mapKey: MapKey,
  mapValue: NonNullable<ActionTemplate[K]>[MapKey]
): void;

export function crudUpdateActionTemplateByField<
  K extends keyof ActionTemplate,
  MapKey extends keyof NonNullable<ActionTemplate[K]>,
>(
  actionTemplateUuid: string,
  fieldName: K,
  valueOrMapKey: ActionTemplate[K] | MapKey,
  mapValue?: NonNullable<ActionTemplate[K]>[MapKey]
): void {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  const updatedAtTime = getAccurateNow().getTime();
  missionDocHandle.change((m: Mission) => {
    const actionTemplate = m.actionTemplates?.[actionTemplateUuid];
    if (actionTemplate) {
      if (mapValue !== undefined) {
        const map = actionTemplate[fieldName] as NonNullable<ActionTemplate[K]>;
        map[valueOrMapKey as MapKey] = mapValue;
      } else {
        actionTemplate[fieldName] = valueOrMapKey as ActionTemplate[K];
      }
      actionTemplate.updatedAt = updatedAtTime;
      m.updatedAt = updatedAtTime;
    }
  });
}

export const crudDuplicateActionTemplate = (actionTemplateUuid: string): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  if (!missionDocHandle) {
    clientLogger.error(
      { logId: "crud-actionTemplate", logValue: "Mission doc handle is not set" },
      new Error("Mission doc handle is not set")
    );
    return;
  }
  missionDocHandle.change((m: Mission) => {
    const modelTemplate = m.actionTemplates[actionTemplateUuid];
    if (!modelTemplate) return;

    // Convert to plain object to avoid Automerge reference issues when using cloneDeep
    const plainTemplate = JSON.parse(JSON.stringify(modelTemplate));

    const newActionTemplateUuid = uuidv4();
    const duplicatedActionTemplate: ActionTemplate = {
      ...plainTemplate,
      createdAt: getAccurateNow().getTime(),
      updatedAt: getAccurateNow().getTime(),
      templateName: makeUniqueStringCopy(
        modelTemplate.templateName || "",
        Object.entries(m.actionTemplates).map(([_, at]) => at.templateName) || []
      ),
    };

    // Push directly to Automerge-tracked array
    m.actionTemplates[newActionTemplateUuid] = duplicatedActionTemplate;
    m.updatedAt = getAccurateNow().getTime();
  });
};

export const crudUpdateActionTemplateActionDefinition = (
  actionTemplateUuid: string,
  type: keyof ActionDefinition,
  uuid: string
): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  if (!missionDocHandle) {
    clientLogger.error(
      { logId: "crud-actionTemplate", logValue: "Mission doc handle is not set" },
      new Error("Mission doc handle is not set")
    );
    return;
  }
  missionDocHandle.change((m: Mission) => {
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
  });
};
