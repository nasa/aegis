import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import { StoreType } from "store";
import { upsertActionByField } from "store/action";
import { upsertMissionByField } from "store/mission";
import {
  thunkCreateGeoUnit,
  thunkDeleteGeoUnit,
  thunkUpdateGeoUnit,
} from "store/thunk/thunkMission-geoUnits";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

let store: StoreType;
const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});

beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(() => {
  // clear all call counts between each test
  jest.clearAllMocks();
});

afterAll(() => {
  // restore original implementation
  alertSpy.mockRestore();
});

describe("Thunk Mission Geo Unit Tests", () => {
  test("thunkCreateGeoUnit", async () => {
    const geoUnitCount = Object.keys(store.getState().mission.mission.geographicUnits || {}).length;

    await store.dispatch(thunkCreateGeoUnit());
    expect(Object.keys(store.getState().mission.mission.geographicUnits).length).toEqual(
      geoUnitCount + 1
    );

    await store.dispatch(thunkCreateGeoUnit());
    expect(Object.keys(store.getState().mission.mission.geographicUnits).length).toEqual(
      geoUnitCount + 2
    );
  });

  test("thunkUpdateGeoUnit()", async () => {
    await store.dispatch(thunkCreateGeoUnit());
    const geoUnitCount = Object.keys(store.getState().mission.mission.geographicUnits).length;
    const geoUnitUuid = Object.keys(store.getState().mission.mission.geographicUnits)[0];
    await store.dispatch(
      thunkUpdateGeoUnit({
        uuid: geoUnitUuid,
        fieldName: "name",
        value: "Test GeoUnit Modified",
      })
    );
    expect(Object.keys(store.getState().mission.mission.geographicUnits).length).toBe(geoUnitCount);
    expect(store.getState().mission.mission.geographicUnits[geoUnitUuid].name).toBe(
      "Test GeoUnit Modified"
    );
  });

  test("thunkDeleteGeoUnit() on action", async () => {
    await store.dispatch(thunkCreateGeoUnit());
    const geoUnitCount = Object.keys(store.getState().mission.mission.geographicUnits).length;

    // assign a geo unit to an action
    const geoUnitUuidForAction = Object.keys(store.getState().mission.mission.geographicUnits)[0];
    const action = store.getState().action.actions[0];
    store.dispatch(
      upsertActionByField(action.uuid, "geographicUnitsUsage", [geoUnitUuidForAction])
    );

    // should fail to to delete.
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForAction }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(store.getState().mission.mission.geographicUnits).length).toBe(geoUnitCount);

    // remove from action and try to delete again. should succeed
    store.dispatch(upsertActionByField(action.uuid, "geographicUnitsUsage", []));
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForAction }));
    expect(Object.keys(store.getState().mission.mission.geographicUnits).length).toBe(
      geoUnitCount - 1
    );
    expect(store.getState().mission.mission.geographicUnits[geoUnitUuidForAction]).toBeUndefined();
  });

  test("thunkDeleteGeoUnit() on action template", async () => {
    await store.dispatch(thunkCreateGeoUnit());
    const geoUnitCount = Object.keys(store.getState().mission.mission.geographicUnits).length;

    // assign a geo unit to a template
    const geoUnitUuidForTemplate = Object.keys(store.getState().mission.mission.geographicUnits)[0];
    const actionTemplate = generateBlankActionTemplate({
      templateName: "Jest Action Template",
      geographicUnitsUsage: [geoUnitUuidForTemplate],
    });
    const actionTemplateUuid = uuidv4();
    store.dispatch(
      upsertMissionByField("actionTemplates", { [actionTemplateUuid]: actionTemplate })
    );

    // try to delete
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForTemplate }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(store.getState().mission.mission.geographicUnits).length).toBe(geoUnitCount);

    // remove from action template and try to delete again. should succeed
    store.dispatch(upsertMissionByField("actionTemplates", {}));
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForTemplate }));
    expect(
      store.getState().mission.mission.geographicUnits[geoUnitUuidForTemplate]
    ).toBeUndefined();
    expect(Object.keys(store.getState().mission.mission.geographicUnits).length).toBe(
      geoUnitCount - 1
    );
  });
});
