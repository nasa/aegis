import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { getAccurateNow } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import capitalize from "lodash/capitalize";

export const crudCreateActionDefinitionItem = (type: ActionDefinitionType): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;

  const newUuid = uuidv4();
  const blankItem: ActionDefinitionItem = {
    name: `(${capitalize(type.slice(0, -1))} Name)`,
    abbr: "abbr",
  };

  missionDocHandle.change((m: Mission) => {
    m.actionDefinitions[type][newUuid] = blankItem;
    m.updatedAt = getAccurateNow().getTime();
  });
};

// export const crudDeleteActionDefinition = (type: ActionDefinitionType, uuid: string) => {};

export const crudUpdateActionDefinitionItemByField = <K extends keyof ActionDefinitionItem>(
  type: ActionDefinitionType,
  uuid: string,
  fieldName: K,
  value: ActionDefinitionItem[K]
): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;

  missionDocHandle.change((m: Mission) => {
    const actionDefinitionItem = m.actionDefinitions?.[type]?.[uuid];
    if (actionDefinitionItem) {
      actionDefinitionItem[fieldName] = value;
      m.updatedAt = getAccurateNow().getTime();
    }
  });
};
