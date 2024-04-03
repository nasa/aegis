import { StoreType } from "store";
import { upsertMission, upsertMissionByField } from "store/mission";
import {
  thunkCreateActionTemplate,
  thunkDeleteActionTemplate,
  thunkMakeExportString,
  thunkMissionCancel,
  thunkMissionSave,
  thunkUpdateActionTemplate,
  thunkUpdateLanderLocation,
} from "store/thunk/thunkMission";
import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import { v4 as uuidv4 } from "uuid";
import _ from "lodash";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the jest.mock
jest.mock("http-client/action");
jest.mock("http-client/station");
jest.mock("http-client/traverse");
jest.mock("http-client/mission");
jest.mock("http-client/preset");
import * as httpClient_action from "http-client/action";
import * as httpClient_station from "http-client/station";
import * as httpClient_traverse from "http-client/traverse";
import * as httpClient_mission from "http-client/mission";
import * as httpClient_preset from "http-client/preset";

const mockThunkGetElevation = jest.fn();
jest.mock("store/thunk/thunkElevation", () => ({
  thunkGetElevation: () => mockThunkGetElevation,
}));

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  // restoreAllMocks() only restores mocks with .spyOn(). All others must be called manually
  // Modules mocked with jest.mock are only mocked for the file
  // https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options
  jest.restoreAllMocks();
});

describe("Thunk Mission Tests", () => {
  it("thunkMissionSave", async () => {
    const missionCopy = _.cloneDeep(store.getState().mission.mission);
    const newLanderRadii = { uuid: uuidv4(), name: "Jest Test Lander Radii", radius: 10 };
    const newName = "Jest Mission Test Save";
    store.dispatch(upsertMission({ ...missionCopy, name: newName, landerRadii: [newLanderRadii] }));
    const oldPreset = store.getState().preset.presets[0];

    await store.dispatch(thunkMissionSave());
    expect(httpClient_mission.upsertMissions).toHaveBeenCalledTimes(1);
    expect(store.getState().mission.missionFromDb.name).toEqual(newName);

    // all presets should update with a new layer for this landerRadii
    expect(
      store.getState().preset.presetsUIStates[oldPreset.uuid][newLanderRadii.uuid].name
    ).toEqual("Jest Test Lander Radii");
    expect(httpClient_preset.upsertPresets).toHaveBeenCalledTimes(
      store.getState().preset.presets.length
    );

    // map circle controls should have the new radii
    expect(store.getState().map.mapCircleControls[newLanderRadii.uuid].name).toEqual(
      "Jest Test Lander Radii"
    );
  });

  it("thunkMissionCancel", async () => {
    const missionName = store.getState().mission.mission.name;
    const missionNameModified = "Jest Mission Cancel Test Modify";

    store.dispatch(upsertMissionByField("name", missionNameModified));
    expect(store.getState().mission.mission.name).toBe(missionNameModified);

    await store.dispatch(thunkMissionCancel());

    expect(store.getState().mission.mission.name).toBe(missionName);
    expect(store.getState().mission.missionSectionsEditing).toEqual([]);
  });

  it("thunkUpdateLanderLocation", async () => {
    const newLanderLoc: AEGISPoint = { lat: 1.1, lng: 1.1 };

    await store.dispatch(thunkUpdateLanderLocation({ location: newLanderLoc }));
    expect(store.getState().mission.mission.landerLocation).toEqual(newLanderLoc);
    expect(mockThunkGetElevation).toHaveBeenCalled();

    // check walkback on stations
    const station = store.getState().station.stations[0];
    const numStations = store.getState().station.stations.length;
    expect(station.walkbackPath[station.walkbackPath.length - 1]).toEqual(newLanderLoc);
    expect(httpClient_station.upsertStations).toHaveBeenCalledTimes(numStations);

    //check evas
    const evaFromLander = store.getState().eva.evas.find((e) => e.egressLocationUuid === "lander");
    const traverseFromLander = store
      .getState()
      .traverse.traverses.find((t) => t.uuid === evaFromLander.sequence[0].uuid);
    expect(traverseFromLander.path[0]).toEqual(newLanderLoc);
    expect(httpClient_traverse.upsertTraverses).toHaveBeenCalled();
    expect(httpClient_action.upsertActions).not.toHaveBeenCalled(); // no actions should be updated
  });

  it("thunkCreateActionTemplate", async () => {
    const numActionTemplates = store.getState().mission.mission.actionTemplates?.length || 0;
    await store.dispatch(thunkCreateActionTemplate());
    expect(store.getState().mission.mission.actionTemplates.length).toEqual(numActionTemplates + 1);
  });

  it("thunkUpdateActionTemplate", async () => {
    const actionTemplate = store.getState().mission.mission.actionTemplates[0];
    const updatedName = "Jest Test Action Template Modified";
    await store.dispatch(
      thunkUpdateActionTemplate({
        uuid: actionTemplate.uuid,
        fieldName: "name",
        value: updatedName,
      })
    );
    const updatedActionTemplate = store
      .getState()
      .mission.mission.actionTemplates.find((a) => a.uuid === actionTemplate.uuid);
    expect(updatedActionTemplate.name).toEqual(updatedName);
  });

  it("thunkDeleteActionTemplate", async () => {
    const actionTemplateToDelete = store.getState().mission.mission.actionTemplates[0];
    await store.dispatch(
      thunkDeleteActionTemplate({ actionTemplateUuid: actionTemplateToDelete.uuid })
    );
    expect(
      store
        .getState()
        .mission.mission.actionTemplates.find((a) => a.uuid === actionTemplateToDelete.uuid)
    ).toBeUndefined();
  });

  it("thunkMakeExportString", async () => {
    const exportRes = await store.dispatch(
      thunkMakeExportString({
        selectEvas: true,
        selectMission: true,
        selectPois: true,
        selectStations: true,
        selectActions: true,
        selectTraverses: true,
        selectRexes: true,
      })
    );
    expect(exportRes.payload).toBeTruthy();
  });
});
