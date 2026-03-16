import type { StoreType } from "store";
import { updateMapDirective } from "store/map";
import { thunkCancelMarkerMapDirective } from "store/thunk/thunkMap";
import { createFullTestStore } from "tests/jest/factories/makeTestStore";

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

describe("Thunk Map Tests", () => {
  it("thunkCancelMarkerMapDirective", async () => {
    const station = store.getState().station.stations[0];

    // no current map directive, nothing should happen
    await store.dispatch(thunkCancelMarkerMapDirective({ uuid: station.uuid }));

    // add a map directive
    const newMapDirective_edit: MapDirective = {
      uuid: store.getState().station.stations[0].uuid,
      mapItemType: "station",
      mapAction: "editMarker",
    };
    store.dispatch(updateMapDirective(newMapDirective_edit));
    await store.dispatch(thunkCancelMarkerMapDirective({ uuid: station.uuid }));
    expect(store.getState().map.mapDirective).toEqual({
      ...newMapDirective_edit,
      mapAction: "cancelEditMarker",
    });

    // add a map directive
    const newMapDirective_create: MapDirective = {
      uuid: store.getState().station.stations[0].uuid,
      mapItemType: "station",
      mapAction: "createMarker",
    };
    store.dispatch(updateMapDirective(newMapDirective_create));
    await store.dispatch(thunkCancelMarkerMapDirective({ uuid: station.uuid }));
    expect(store.getState().map.mapDirective).toEqual({
      ...newMapDirective_create,
      mapAction: "cancelCreateMarker",
    });
  });
});
