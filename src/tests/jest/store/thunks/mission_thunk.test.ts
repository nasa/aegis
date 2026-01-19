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
import cloneDeep from "lodash/cloneDeep";

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

const mockThunkGetElevation = jest.fn().mockReturnValue({
  meta: { requestStatus: "rejected" },
});
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
    const missionCopy = cloneDeep(store.getState().mission.mission);
    const newCircleDefUuid = uuidv4();
    const newCircleDefinition = {
      [newCircleDefUuid]: {
        name: "Jest Test Circle Definition",
        radius: 10,
      },
    };
    const newName = "Jest Mission Test Save";
    store.dispatch(
      upsertMission({ ...missionCopy, name: newName, circleDefinitions: newCircleDefinition })
    );
    const oldPreset = store.getState().preset.presets[0];

    await store.dispatch(thunkMissionSave());
    expect(httpClient_mission.upsertMissions).toHaveBeenCalledTimes(1);
    expect(store.getState().mission.missionFromDb.name).toEqual(newName);

    // all presets should update with a new layer for this circleDefinitions
    expect(
      store.getState().preset.presetCirclesUIStates[oldPreset.uuid][newCircleDefUuid].name
    ).toEqual("Jest Test Circle Definition");
    expect(httpClient_preset.upsertPresets).toHaveBeenCalledTimes(
      store.getState().preset.presets.length
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
    const actionTemplates = store.getState().mission.mission.actionTemplates;
    const numActionTemplates = Object.entries(actionTemplates).length || 0;
    await store.dispatch(thunkCreateActionTemplate());
    const neeNumActionTemplates = Object.entries(
      store.getState().mission.mission.actionTemplates
    ).length;
    expect(neeNumActionTemplates).toEqual(numActionTemplates + 1);
  });

  it("thunkUpdateActionTemplate", async () => {
    const actionTemplateKeys = Object.keys(store.getState().mission.mission.actionTemplates);
    const updatedName = "Jest Test Action Template Modified";
    await store.dispatch(
      thunkUpdateActionTemplate({
        uuid: actionTemplateKeys[0],
        fieldName: "name",
        value: updatedName,
      })
    );
    const updatedActionTemplate =
      store.getState().mission.mission.actionTemplates[actionTemplateKeys[0]];
    expect(updatedActionTemplate.name).toEqual(updatedName);
  });

  it("thunkDeleteActionTemplate", async () => {
    const actionTemplateKeys = Object.keys(store.getState().mission.mission.actionTemplates);
    await store.dispatch(thunkDeleteActionTemplate({ actionTemplateUuid: actionTemplateKeys[0] }));
    expect(store.getState().mission.mission.actionTemplates[actionTemplateKeys[0]]).toBeUndefined();
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
