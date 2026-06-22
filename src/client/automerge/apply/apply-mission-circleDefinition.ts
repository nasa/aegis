import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

import { applyUpdateMissionByField } from "./apply-mission";

/**
 * Insert a new blank CircleDefinition into the Mission draft.
 * Returns the newly-allocated uuid.
 */
export function applyCreateCircleDefinition(m: Mission): string {
  const circleDefUuid = uuidv4();
  const blankCircleDef: CircleDefinition = {
    name: "(Circle Definition Name)",
    radius: 10,
  };
  applyUpdateMissionByField(m, {
    fieldName: "circleDefinitions",
    mapKey: circleDefUuid,
    mapValue: blankCircleDef,
  });
  return circleDefUuid;
}

/**
 * Delete a CircleDefinition from the Mission draft.
 */
export function applyDeleteCircleDefinition(
  m: Mission,
  { circleDefUuid }: { circleDefUuid: string }
): void {
  if (m.circleDefinitions?.[circleDefUuid]) {
    delete m.circleDefinitions?.[circleDefUuid];
    m.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Update a single field on a CircleDefinition in the Mission draft.
 */
export function applyUpdateCircleDefinitionByField<K extends keyof CircleDefinition>(
  m: Mission,
  {
    circleDefUuid,
    fieldName,
    value,
  }: {
    circleDefUuid: string;
    fieldName: K;
    value: CircleDefinition[K];
  }
): void {
  const circleDef = m.circleDefinitions?.[circleDefUuid];
  if (circleDef) {
    circleDef[fieldName] = cloneDeep(value);
    m.updatedAt = getAccurateNow().getTime();
  }
}
