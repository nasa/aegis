import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { getAccurateNow } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { crudUpdateMissionByField } from "./crud-mission";
import { generateBlankGeographicUnit } from "store/storeUtils/mission";

export const crudCreateGeoUnit = (): void => {
  const blankItem: GeographicUnit = generateBlankGeographicUnit();
  const blankItemUuid = uuidv4();

  crudUpdateMissionByField("geographicUnits", blankItemUuid, blankItem);
};

// export const crudDeleteGeoUnit = (geoUnitUuid: string): void => {};

export const crudUpdateGeoUnitByField = <K extends keyof GeographicUnit>(
  geoUnitUuid: string,
  fieldName: K,
  value: GeographicUnit[K]
): void => {
  const missionDocHandle = getAutomergeDocHandles()?.mission;
  missionDocHandle.change((m: Mission) => {
    const geoUnit = m.geographicUnits?.[geoUnitUuid];
    if (geoUnit) {
      geoUnit[fieldName] = value;
      m.updatedAt = getAccurateNow().getTime();
    }
  });
};
