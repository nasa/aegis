import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyCreateGeoUnit } from "operations/apply/apply-mission-geoUnit";
import { thunkDocDeleteGeoUnit } from "store/thunk/thunkMissionGeoUnit";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";
import { createCustomTestStore } from "../../fixtures/store";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.geographicUnits = {};
    m.actions = {};
    m.actionTemplates = {};
    m.stations = {};
    m.pois = {};
  });
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("thunkDocDeleteGeoUnit", () => {
  it("deletes the geo unit when it is not used by any action or template", async () => {
    const geographicUnitUuid = withMissionChange((m) => applyCreateGeoUnit(m));

    const store = createCustomTestStore({});
    await store.dispatch(thunkDocDeleteGeoUnit({ geographicUnitUuid }));

    expect(getMissionDocHandle().doc().geographicUnits[geographicUnitUuid]).toBeUndefined();
  });

  it("returns a rejection with a message when geo unit is used by an action", async () => {
    const geographicUnitUuid = uuidv4();
    const action = generateBlankAction({
      geographicUnitsUsage: [geographicUnitUuid],
      stationUuid: uuidv4(),
    });
    getMissionDocHandle().change((m) => {
      m.geographicUnits[geographicUnitUuid] = {
        name: "Vitest GeoUnit",
        abbr: "VG",
      } as unknown as GeographicUnit;
      m.actions[action.uuid] = action;
      m.stations[action.stationUuid] = {
        uuid: action.stationUuid,
        name: "Vitest Station A",
      } as unknown as Station;
    });

    const store = createCustomTestStore({});
    const result = await store.dispatch(thunkDocDeleteGeoUnit({ geographicUnitUuid }));

    expect(thunkDocDeleteGeoUnit.rejected.match(result)).toBe(true);
    expect(result.payload).toContain("being used by one or more actions");
    expect(getMissionDocHandle().doc().geographicUnits[geographicUnitUuid]).toBeDefined();
  });

  it("returns a rejection with a message when geo unit is used by a template", async () => {
    const geographicUnitUuid = uuidv4();
    const template = generateBlankActionTemplate({
      templateName: "Vitest Template",
      geographicUnitsUsage: [geographicUnitUuid],
    });
    const templateUuid = uuidv4();
    getMissionDocHandle().change((m) => {
      m.geographicUnits[geographicUnitUuid] = {
        name: "Vitest GeoUnit",
        abbr: "VG",
      } as unknown as GeographicUnit;
      m.actionTemplates[templateUuid] = template;
    });

    const store = createCustomTestStore({});
    const result = await store.dispatch(thunkDocDeleteGeoUnit({ geographicUnitUuid }));

    expect(thunkDocDeleteGeoUnit.rejected.match(result)).toBe(true);
    expect(result.payload).toContain("being used by one or more actions");
    expect(getMissionDocHandle().doc().geographicUnits[geographicUnitUuid]).toBeDefined();
  });
});
