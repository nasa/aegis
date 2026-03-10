import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { getAccurateNow } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { crudUpdateMissionByField } from "./crud-mission";

export const crudCreateCircleDefinition = (): string => {
  const circleDefUuid = uuidv4();
  const blankCircleDef: CircleDefinition = {
    name: "(Circle Definition Name)",
    radius: 10,
  };
  crudUpdateMissionByField("circleDefinitions", circleDefUuid, blankCircleDef);

  return circleDefUuid;
};

export const crudDeleteCircleDefinition = (circleDefUuid: string): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  missionDocHandle.change((m: Mission) => {
    if (m.circleDefinitions?.[circleDefUuid]) {
      delete m.circleDefinitions?.[circleDefUuid];
      m.updatedAt = getAccurateNow().getTime();
    }
  });
};

export const crudUpdateCircleDefinitionByField = <K extends keyof CircleDefinition>(
  circleDefUuid: string,
  fieldName: K,
  value: CircleDefinition[K]
): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  missionDocHandle.change((m: Mission) => {
    const circleDef = m.circleDefinitions?.[circleDefUuid];
    if (circleDef) {
      circleDef[fieldName] = value;
      m.updatedAt = getAccurateNow().getTime();
    }
  });
};
