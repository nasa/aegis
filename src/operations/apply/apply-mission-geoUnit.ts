import cloneDeep from "lodash/cloneDeep";
import { v4 as uuidv4 } from "uuid";

import { generateBlankGeographicUnit } from "store/storeUtils/mission";
import { getAccurateNow } from "utils/formatting";

import { applyUpdateMissionByField } from "./apply-mission";

/**
 * Insert a new blank GeographicUnit into the Mission draft.
 * Returns the newly-allocated uuid.
 */
export function applyCreateGeoUnit(m: Mission): string {
  const blankItem: GeographicUnit = generateBlankGeographicUnit();
  const blankItemUuid = uuidv4();

  applyUpdateMissionByField(m, {
    fieldName: "geographicUnits",
    mapKey: blankItemUuid,
    mapValue: blankItem,
  });

  return blankItemUuid;
}

/**
 * Update a single field on a GeographicUnit in the Mission draft.
 */
export function applyUpdateGeoUnitByField<K extends keyof GeographicUnit>(
  m: Mission,
  {
    geoUnitUuid,
    fieldName,
    value,
  }: {
    geoUnitUuid: string;
    fieldName: K;
    value: GeographicUnit[K];
  }
): void {
  const geoUnit = m.geographicUnits?.[geoUnitUuid];
  if (geoUnit) {
    geoUnit[fieldName] = cloneDeep(value);
    m.updatedAt = getAccurateNow().getTime();
  }
}

/**
 * Delete a GeographicUnit from the Mission draft by uuid.
 */
export function applyDeleteGeoUnit(
  m: Mission,
  { geographicUnitUuid }: { geographicUnitUuid: string }
): void {
  if (m.geographicUnits?.[geographicUnitUuid]) {
    delete m.geographicUnits[geographicUnitUuid];
    m.updatedAt = getAccurateNow().getTime();
  }
}
