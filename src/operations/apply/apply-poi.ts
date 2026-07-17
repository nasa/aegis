import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";

/** Insert/replace a POI in the doc. */
export function applyUpsertPoi(m: Mission, poi: POI): void {
  m.pois[poi.uuid] = cloneDeep(poi);
}

/** Update a single POI field. */
export function applyUpdatePoiByField<K extends keyof POI>(
  m: Mission,
  {
    poiUuid,
    fieldName,
    value,
    preserveUpdatedAt = false,
  }: {
    poiUuid: string;
    fieldName: K;
    value: POI[K];
    preserveUpdatedAt?: boolean;
  }
): void {
  const poi = m.pois[poiUuid];
  if (!poi) return;
  poi[fieldName] = cloneDeep(value);
  if (!preserveUpdatedAt) {
    poi.updatedAt = getAccurateNow().getTime();
  }
}

/** Delete a list of POIs from the doc. */
export function applyDeletePois(m: Mission, poiUuids: string[]): void {
  for (const uuid of poiUuids) {
    delete m.pois[uuid];
  }
}
