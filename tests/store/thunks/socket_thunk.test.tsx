import { StoreType } from "store";
import { createFullTestStore } from "tests/factories/makeTestStore";
import { createTestPreset } from "tests/factories/PresetFactory";
import { thunkSocketsHandleDelete, thunkSocketsHandleUpsert } from "store/thunk/thunkSockets";
import _ from "lodash";
import { setPresetEditMode, upsertPreset } from "store/preset";
import { createTestPoi } from "tests/factories/PoiFactory";
import { setPoiEditMode, upsertPoi } from "store/poi";
import { setStationEditMode, upsertStation } from "store/station";
import { setEvaEditMode, upsertEva } from "store/eva";
import { createTestEva } from "tests/factories/EVAFactory";
import { createTestStation } from "tests/factories/StationFactory";
import { createTestAction } from "tests/factories/ActionFactory";
import { createTestTraverse } from "tests/factories/TraverseFactory";
import { setTraverseEditMode, upsertTraverses } from "store/traverse";
import { createTestMission } from "tests/factories/MissionFactory";
import { setMissionSectionEditing } from "store/mission";
import { createTestRex } from "tests/factories/RexFactory";
import { setRexEditMode, upsertRexes } from "store/rex";
import { upsertAction } from "store/action";

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk Socket Tests", () => {
  describe("thunkSocketsHandleUpsert", () => {
    it("preset", async () => {
      const data = createTestPreset();
      const storeUpsert: StoreUpsert<Preset> = {
        socketId: null,
        missionId: null,
        type: "preset",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Jest Test In Edit Mode";
      storeUpsert.data = [_.cloneDeep(data)];
      store.dispatch(setPresetEditMode({ presetUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("poi", async () => {
      const data = createTestPoi();
      const storeUpsert: StoreUpsert<POI> = {
        socketId: null,
        missionId: null,
        type: "poi",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().poi.pois.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().poi.poisFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().poi.pois.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().poi.poisFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Jest Test In Edit Mode";
      storeUpsert.data = [_.cloneDeep(data)];
      store.dispatch(setPoiEditMode({ poiUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().poi.pois.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().poi.poisFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().poi.poisEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("station", async () => {
      const data = createTestStation();
      const storeUpsert: StoreUpsert<Station> = {
        socketId: null,
        missionId: null,
        type: "station",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().station.stations.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(
        store.getState().station.stationsFromDb.some((x) => x.uuid === data.uuid)
      ).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().station.stations.some((x) => x.name === data.name)).toBeTruthy();
      expect(
        store.getState().station.stationsFromDb.some((x) => x.name === data.name)
      ).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Jest Test In Edit Mode";
      storeUpsert.data = [_.cloneDeep(data)];
      store.dispatch(setStationEditMode({ stationUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().station.stations.some((x) => x.name === data.name)).toBeTruthy();
      expect(
        store.getState().station.stationsFromDb.some((x) => x.name === data.name)
      ).toBeTruthy();
      expect(store.getState().station.stationsEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("eva", async () => {
      const data = createTestEva();
      const storeUpsert: StoreUpsert<Eva> = {
        socketId: null,
        missionId: null,
        type: "eva",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().eva.evas.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().eva.evasFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().eva.evas.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().eva.evasFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Jest Test In Edit Mode";
      storeUpsert.data = [_.cloneDeep(data)];
      store.dispatch(setEvaEditMode({ evaUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().eva.evas.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().eva.evasFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().eva.evasEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("action", async () => {
      const data = createTestAction({});
      const storeUpsert: StoreUpsert<Action> = {
        socketId: null,
        missionId: null,
        type: "action",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().action.actions.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().action.actionsFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().action.actions.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().action.actionsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);
    });

    it("traverse", async () => {
      const data = createTestTraverse();
      const storeUpsert: StoreUpsert<Traverse> = {
        socketId: null,
        missionId: null,
        type: "traverse",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().traverse.traverses.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(
        store.getState().traverse.traversesFromDb.some((x) => x.uuid === data.uuid)
      ).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().traverse.traverses.some((x) => x.name === data.name)).toBeTruthy();
      expect(
        store.getState().traverse.traversesFromDb.some((x) => x.name === data.name)
      ).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Jest Test In Edit Mode";
      storeUpsert.data = [_.cloneDeep(data)];
      store.dispatch(setTraverseEditMode({ uuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().traverse.traverses.some((x) => x.name === data.name)).toBeTruthy();
      expect(
        store.getState().traverse.traversesFromDb.some((x) => x.name === data.name)
      ).toBeTruthy();
      expect(store.getState().traverse.traversesEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("mission", async () => {
      const data = createTestMission();
      const storeUpsert: StoreUpsert<Mission> = {
        socketId: null,
        missionId: null,
        type: "mission",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().mission.mission.name).toEqual(data.name);
      expect(store.getState().mission.missionFromDb.name).toEqual(data.name);
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Jest Test In Edit Mode";
      storeUpsert.data = [_.cloneDeep(data)];
      store.dispatch(setMissionSectionEditing({ section: "prefs", editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().mission.mission.name).toEqual(data.name);
      expect(store.getState().mission.missionFromDb.name).toEqual(data.name);
      expect(store.getState().mission.missionSectionsEditing.includes("prefs")).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("rex", async () => {
      const data = createTestRex();
      const storeUpsert: StoreUpsert<Rex> = {
        socketId: null,
        missionId: null,
        type: "rex",
        data: [_.cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Jest Test Modified Name";
      storeUpsert.data = [_.cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Jest Test In Edit Mode";
      storeUpsert.data = [_.cloneDeep(data)];
      store.dispatch(setRexEditMode({ rexUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().rex.rexesEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });
  });

  describe("thunkSocketsHandleDelete", () => {
    it("preset", async () => {
      const data = createTestPreset();
      const dataInEditMode = createTestPreset();
      store.dispatch(upsertPreset(data));
      store.dispatch(upsertPreset(dataInEditMode));
      store.dispatch(setPresetEditMode({ presetUuid: dataInEditMode.uuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "preset",
        uuids: [],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      storeDelete.uuids = [data.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().preset.presets.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      //test data in edit mode
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(
        store.getState().preset.presets.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(
        store.getState().preset.presetsFromDb.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(store.getState().preset.presetsEditing.includes(dataInEditMode.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("poi", async () => {
      const data = createTestPoi();
      const dataInEditMode = createTestPoi();
      store.dispatch(upsertPoi(data));
      store.dispatch(upsertPoi(dataInEditMode));
      store.dispatch(setPoiEditMode({ poiUuid: dataInEditMode.uuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "poi",
        uuids: [],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      storeDelete.uuids = [data.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().poi.pois.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().poi.poisFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      //test data in edit mode
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().poi.pois.some((x) => x.uuid === dataInEditMode.uuid)).toBeFalsy();
      expect(
        store.getState().poi.poisFromDb.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(store.getState().poi.poisEditing.includes(dataInEditMode.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("station", async () => {
      const data = createTestStation();
      const dataInEditMode = createTestStation();
      store.dispatch(upsertStation(data));
      store.dispatch(upsertStation(dataInEditMode));
      store.dispatch(setStationEditMode({ stationUuid: dataInEditMode.uuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "station",
        uuids: [],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      storeDelete.uuids = [data.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().station.stations.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().station.stationsFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      //test data in edit mode
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(
        store.getState().station.stations.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(
        store.getState().station.stationsFromDb.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(store.getState().station.stationsEditing.includes(dataInEditMode.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("eva", async () => {
      const data = createTestEva();
      const dataInEditMode = createTestEva();
      store.dispatch(upsertEva(data));
      store.dispatch(upsertEva(dataInEditMode));
      store.dispatch(setEvaEditMode({ evaUuid: dataInEditMode.uuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "eva",
        uuids: [],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      storeDelete.uuids = [data.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().eva.evas.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().eva.evasFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      //test data in edit mode
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().eva.evas.some((x) => x.uuid === dataInEditMode.uuid)).toBeFalsy();
      expect(
        store.getState().eva.evasFromDb.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(store.getState().eva.evasEditing.includes(dataInEditMode.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("action", async () => {
      const data = createTestAction({});
      const dataInEditMode = createTestAction({});
      store.dispatch(upsertAction(data));
      store.dispatch(upsertAction(dataInEditMode));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "action",
        uuids: [],
        lastEditEvent: null,
      };

      //test new data
      storeDelete.uuids = [data.uuid];
      const messages = (
        await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete }))
      ).payload;
      expect(store.getState().action.actions.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().action.actionsFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);
    });

    it("traverse", async () => {
      const data = createTestTraverse();
      const dataInEditMode = createTestTraverse();
      store.dispatch(upsertTraverses([data]));
      store.dispatch(upsertTraverses([dataInEditMode]));
      store.dispatch(setTraverseEditMode({ uuid: dataInEditMode.uuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "traverse",
        uuids: [],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      storeDelete.uuids = [data.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().traverse.traverses.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(
        store.getState().traverse.traversesFromDb.some((x) => x.uuid === data.uuid)
      ).toBeFalsy();
      expect(messages).toEqual([]);

      //test data in edit mode
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(
        store.getState().traverse.traverses.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(
        store.getState().traverse.traversesFromDb.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(store.getState().traverse.traversesEditing.includes(dataInEditMode.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("rex", async () => {
      const data = createTestRex();
      const dataInEditMode = createTestRex();
      store.dispatch(upsertRexes([data]));
      store.dispatch(upsertRexes([dataInEditMode]));
      store.dispatch(setRexEditMode({ rexUuid: dataInEditMode.uuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "rex",
        uuids: [],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      storeDelete.uuids = [data.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().rex.rexes.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      //test data in edit mode
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete: storeDelete })))
        .payload;
      expect(store.getState().rex.rexes.some((x) => x.uuid === dataInEditMode.uuid)).toBeFalsy();
      expect(
        store.getState().rex.rexesFromDb.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect(store.getState().rex.rexesEditing.includes(dataInEditMode.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });
  });
});
