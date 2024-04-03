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
  // restore original implmentation
  alertSpy.mockRestore();
});

describe("Thunk Mission Geo Unit Tests", () => {
  test("thunkCreateGeoUnit", async () => {
    const geoUnitCount = store.getState().mission.mission.geographicUnits?.length || 0;

    await store.dispatch(thunkCreateGeoUnit());
    expect(store.getState().mission.mission.geographicUnits.length).toEqual(geoUnitCount + 1);

    await store.dispatch(thunkCreateGeoUnit());
    expect(store.getState().mission.mission.geographicUnits.length).toEqual(geoUnitCount + 2);
  });

  test("thunkUpdateGeoUnit()", async () => {
    await store.dispatch(thunkCreateGeoUnit());
    const geoUnitCount = store.getState().mission.mission.geographicUnits.length;
    const geoUnit = store.getState().mission.mission.geographicUnits[0];
    await store.dispatch(
      thunkUpdateGeoUnit({
        uuid: geoUnit.uuid,
        fieldName: "name",
        value: "Test GeoUnit Modified",
      })
    );
    expect(store.getState().mission.mission.geographicUnits.length).toBe(geoUnitCount);
    expect(
      store.getState().mission.mission.geographicUnits.find((e) => e.uuid === geoUnit.uuid).name
    ).toBe("Test GeoUnit Modified");
  });

  test("thunkDeleteGeoUnit() on action", async () => {
    await store.dispatch(thunkCreateGeoUnit());
    const geoUnitCount = store.getState().mission.mission.geographicUnits.length;

    // assign an geo unit to an action
    const geoUnitUuidForAction = store.getState().mission.mission.geographicUnits[0].uuid;
    const action = store.getState().action.actions[0];
    store.dispatch(
      upsertActionByField(action.uuid, "geographicUnitsUsage", [geoUnitUuidForAction])
    );

    // should fail to to delete.
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForAction }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().mission.mission.geographicUnits.length).toBe(geoUnitCount);

    // remove from action and try to delete again. should succeed
    store.dispatch(upsertActionByField(action.uuid, "geographicUnitsUsage", []));
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForAction }));
    expect(store.getState().mission.mission.geographicUnits.length).toBe(geoUnitCount - 1);
    expect(
      store.getState().mission.mission.geographicUnits.find((g) => g.uuid === geoUnitUuidForAction)
    ).toBeUndefined();
  });

  test("thunkDeleteGeoUnit() on action template", async () => {
    await store.dispatch(thunkCreateGeoUnit());
    const geoUnitCount = store.getState().mission.mission.geographicUnits.length;

    // assign an geo unit to a template
    const geoUnitUuidForTemplate = store.getState().mission.mission.geographicUnits[0].uuid;
    const actionTemplate = generateBlankActionTemplate({
      templateName: "Jest Action Template",
      geographicUnitsUsage: [geoUnitUuidForTemplate],
    });
    store.dispatch(upsertMissionByField("actionTemplates", [actionTemplate]));

    // try to delete
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForTemplate }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().mission.mission.geographicUnits.length).toBe(geoUnitCount);

    // remove from action template and try to delete again. should succeed
    store.dispatch(upsertMissionByField("actionTemplates", []));
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForTemplate }));
    expect(
      store
        .getState()
        .mission.mission.geographicUnits.find((g) => g.uuid === geoUnitUuidForTemplate)
    ).toBeUndefined();
    expect(store.getState().mission.mission.geographicUnits.length).toBe(geoUnitCount - 1);
  });
});
