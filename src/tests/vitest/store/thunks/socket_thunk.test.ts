import type { StoreType } from "store";
import { createFullTestStore } from "tests/vitest/fixtures/redux/makeTestStore";
import { thunkSocketsHandleDelete, thunkSocketsHandleUpsert } from "store/thunk/thunkSockets";
import cloneDeep from "lodash/cloneDeep";
import { setPresetEditMode, upsertPresets } from "store/preset";
import { setPoiEditMode, upsertPois } from "store/poi";
import { setStationEditMode, upsertStations } from "store/station";
import { setEvaEditMode, upsertEvas } from "store/eva";
import { setTraversesEditMode, upsertTraverses } from "store/traverse";
import { upsertRexes } from "store/rex";
import { upsertActions } from "store/action";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Socket Tests", () => {
  describe("thunkSocketsHandleUpsert", () => {
    it("preset", async () => {
      const data = generateBlankPreset({ name: "Vitest Test Preset" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "preset",
        data: [cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Vitest Test In Edit Mode";
      storeUpsert.data = [cloneDeep(data)];
      store.dispatch(setPresetEditMode({ presetUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().preset.presets.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().preset.presetsEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("poi", async () => {
      const data = generateBlankPoi({ name: "Vitest Poi-1" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "poi",
        data: [cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().poi.pois.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().poi.poisFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().poi.pois.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().poi.poisFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Vitest Test In Edit Mode";
      storeUpsert.data = [cloneDeep(data)];
      store.dispatch(setPoiEditMode({ poiUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().poi.pois.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().poi.poisFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().poi.poisEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("station", async () => {
      const data = generateBlankStation({ name: "Vitest Station-1" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "station",
        data: [cloneDeep(data)],
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
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().station.stations.some((x) => x.name === data.name)).toBeTruthy();
      expect(
        store.getState().station.stationsFromDb.some((x) => x.name === data.name)
      ).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Vitest Test In Edit Mode";
      storeUpsert.data = [cloneDeep(data)];
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
      const data = generateBlankEVA({ name: "Vitest Eva-1" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "eva",
        data: [cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().eva.evas.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().eva.evasFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().eva.evas.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().eva.evasFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Vitest Test In Edit Mode";
      storeUpsert.data = [cloneDeep(data)];
      store.dispatch(setEvaEditMode({ evaUuid: data.uuid, editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().eva.evas.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().eva.evasFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().eva.evasEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("action", async () => {
      const data = generateBlankAction({ name: "Vitest Action-1" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "action",
        data: [cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().action.actions.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().action.actionsFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().action.actions.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().action.actionsFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);
    });

    it("traverse", async () => {
      const data = generateBlankTraverse({ name: "Vitest Traverse-1" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "traverse",
        data: [cloneDeep(data)],
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
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().traverse.traverses.some((x) => x.name === data.name)).toBeTruthy();
      expect(
        store.getState().traverse.traversesFromDb.some((x) => x.name === data.name)
      ).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Vitest Test In Edit Mode";
      storeUpsert.data = [cloneDeep(data)];
      store.dispatch(setTraversesEditMode({ uuids: [data.uuid], editMode: true }));
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().traverse.traverses.some((x) => x.name === data.name)).toBeTruthy();
      expect(
        store.getState().traverse.traversesFromDb.some((x) => x.name === data.name)
      ).toBeTruthy();
      expect(store.getState().traverse.traversesEditing.includes(data.uuid)).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });

    it("rex", async () => {
      const data = generateBlankRex({ name: "Vitest Rex-1", evaUuid: "someEvaUuid" });
      const storeUpsert: StoreUpsert = {
        socketId: null,
        missionId: null,
        type: "rex",
        data: [cloneDeep(data)],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.uuid === data.uuid)).toBeTruthy();
      expect(messages).toEqual([]);

      //test updating existing the data
      data.name = "Vitest Test Modified Name";
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect(messages).toEqual([]);

      //test data in edit mode
      data.name = "Vitest Test In Edit Mode";
      store.dispatch(setEvaEditMode({ evaUuid: data.evaUuid, editMode: true }));
      storeUpsert.data = [cloneDeep(data)];
      messages = (await store.dispatch(thunkSocketsHandleUpsert({ storeUpsert }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.name === data.name)).toBeTruthy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.name === data.name)).toBeTruthy();
      expect((messages as Array<string>).length).toEqual(1);
    });
  });

  describe("thunkSocketsHandleDelete", () => {
    it("preset", async () => {
      const data = generateBlankPreset({ name: "Vitest Test Preset" });
      const dataInEditMode = generateBlankPreset({ name: "Vitest Test Preset" });
      store.dispatch(upsertPresets([data, dataInEditMode]));
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
      const data = generateBlankPoi({ name: "Vitest Poi-1" });
      const dataInEditMode = generateBlankPoi({ name: "Vitest Poi-1" });
      store.dispatch(upsertPois([data, dataInEditMode]));
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
      const data = generateBlankStation({ name: "Vitest Station-1" });
      const dataInEditMode = generateBlankStation({ name: "Vitest Station-1" });
      store.dispatch(upsertStations([data, dataInEditMode]));
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
      const data = generateBlankEVA({ name: "Vitest Eva-1" });
      const dataInEditMode = generateBlankEVA({ name: "Vitest Eva-1" });
      store.dispatch(upsertEvas([data, dataInEditMode]));
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
      const data = generateBlankAction({ name: "Vitest Action-1" });
      const dataInEditMode = generateBlankAction({ name: "Vitest Action-1" });
      store.dispatch(upsertActions([data, dataInEditMode]));
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
      const data = generateBlankTraverse({ name: "Vitest Traverse-1" });
      const dataInEditMode = generateBlankTraverse({ name: "Vitest Traverse-1" });
      store.dispatch(upsertTraverses([data]));
      store.dispatch(upsertTraverses([dataInEditMode]));
      store.dispatch(setTraversesEditMode({ uuids: [dataInEditMode.uuid], editMode: true }));
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
      const data = generateBlankRex({ name: "Vitest Rex-1", evaUuid: "someEvaUuid1" });
      const dataInEditMode = generateBlankRex({ name: "Vitest Rex-1", evaUuid: "someEvaUuid2" });
      store.dispatch(upsertRexes([data]));
      store.dispatch(upsertRexes([dataInEditMode]));
      store.dispatch(setEvaEditMode({ evaUuid: dataInEditMode.evaUuid, editMode: true }));
      const storeDelete: StoreDelete = {
        socketId: null,
        missionId: null,
        type: "rex",
        uuids: [data.uuid],
        lastEditEvent: null,
      };

      let messages: string[] | false;

      //test new data
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(store.getState().rex.rexesFromDb.some((x) => x.uuid === data.uuid)).toBeFalsy();
      expect(messages).toEqual([]);

      //test data in edit mode
      storeDelete.uuids = [dataInEditMode.uuid];
      messages = (await store.dispatch(thunkSocketsHandleDelete({ storeDelete }))).payload;
      expect(store.getState().rex.rexes.some((x) => x.uuid === dataInEditMode.uuid)).toBeFalsy();
      expect(
        store.getState().rex.rexesFromDb.some((x) => x.uuid === dataInEditMode.uuid)
      ).toBeFalsy();
      expect((messages as Array<string>).length).toEqual(1);
    });
  });
});
