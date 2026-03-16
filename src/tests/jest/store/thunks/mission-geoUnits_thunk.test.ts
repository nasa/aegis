import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import type { StoreType } from "store";
import { upsertActionByField } from "store/action";
import { thunkDeleteGeoUnit } from "store/thunk/thunkMission-geoUnits";
import { generateBlankActionTemplate, generateBlankGeographicUnit } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";
import { getAutomergeDocHandles, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

let store: StoreType;
const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});

beforeAll(() => {
  store = createFullTestStore();

  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked in jest.setup.ts so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
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
  test("thunkDeleteGeoUnit() on action", async () => {
    const missionDocHandle = getAutomergeDocHandles().mission;

    const newGeoUnit = generateBlankGeographicUnit({ name: "Jest Equipment Item" });
    const newGeoUnitUuid = uuidv4();
    missionDocHandle.change((mission) => {
      mission.geographicUnits[newGeoUnitUuid] = newGeoUnit;
    });

    const geoUnitCount = Object.keys(missionDocHandle.doc().geographicUnits).length;

    // assign a geo unit to an action
    const geoUnitUuidForAction = Object.keys(missionDocHandle.doc().geographicUnits)[0];
    const action = store.getState().action.actions[0];
    store.dispatch(
      upsertActionByField(action.uuid, "geographicUnitsUsage", [geoUnitUuidForAction])
    );

    // should fail to to delete.
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForAction }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(missionDocHandle.doc().geographicUnits).length).toBe(geoUnitCount);

    // remove from action and try to delete again. should succeed
    store.dispatch(upsertActionByField(action.uuid, "geographicUnitsUsage", []));
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForAction }));
    expect(Object.keys(missionDocHandle.doc().geographicUnits).length).toBe(geoUnitCount - 1);
    expect(missionDocHandle.doc().geographicUnits[geoUnitUuidForAction]).toBeUndefined();
  });

  test("thunkDeleteGeoUnit() on action template", async () => {
    const missionDocHandle = getAutomergeDocHandles().mission;

    const newGeoUnit = generateBlankGeographicUnit({ name: "Jest Equipment Item" });
    const newGeoUnitUuid = uuidv4();
    missionDocHandle.change((mission) => {
      mission.geographicUnits[newGeoUnitUuid] = newGeoUnit;
    });
    const geoUnitCount = Object.keys(missionDocHandle.doc().geographicUnits).length;

    // assign a geo unit to a template
    const geoUnitUuidForTemplate = Object.keys(missionDocHandle.doc().geographicUnits)[0];
    const actionTemplate = generateBlankActionTemplate({
      templateName: "Jest Action Template",
      geographicUnitsUsage: [geoUnitUuidForTemplate],
    });
    const actionTemplateUuid = uuidv4();
    missionDocHandle.change((mission) => {
      mission.actionTemplates = { [actionTemplateUuid]: actionTemplate };
    });

    // try to delete
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForTemplate }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(missionDocHandle.doc().geographicUnits).length).toBe(geoUnitCount);

    // remove from action template and try to delete again. should succeed
    missionDocHandle.change((mission) => {
      mission.actionTemplates = {};
    });
    await store.dispatch(thunkDeleteGeoUnit({ geographicUnitUuid: geoUnitUuidForTemplate }));
    expect(missionDocHandle.doc().geographicUnits[geoUnitUuidForTemplate]).toBeUndefined();
    expect(Object.keys(missionDocHandle.doc().geographicUnits).length).toBe(geoUnitCount - 1);
  });
});
