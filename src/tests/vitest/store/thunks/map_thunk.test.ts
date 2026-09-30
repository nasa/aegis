import type { StoreType } from "store";
import { updateMapDirective } from "store/map";
import { thunkCancelMarkerMapDirective } from "store/thunk/thunkMap";
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import { getMissionDocHandle } from "client/automergeDocHandles";

let store: StoreType;
let station: Station;

beforeAll(() => {
  store = createTestStoreWithAutomergeMission();
  // entity collections now live on the Automerge mission doc, not in Redux
  const missionDoc = getMissionDocHandle().doc();
  station = Object.values(missionDoc.stations)[0];
});

beforeEach(async () => {
  vi.clearAllMocks(); // clear call count
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk Map Tests", () => {
  it("thunkCancelMarkerMapDirective", async () => {
    // no current map directive, nothing should happen
    await store.dispatch(thunkCancelMarkerMapDirective());

    // add a map directive
    const newMapDirective_edit: MapDirective = {
      uuid: station.uuid,
      mapItemType: "station",
      mapAction: "editMarker",
    };
    store.dispatch(updateMapDirective(newMapDirective_edit));
    await store.dispatch(thunkCancelMarkerMapDirective());
    expect(store.getState().map.mapDirective).toEqual({
      ...newMapDirective_edit,
      mapAction: "cancelEditMarker",
    });

    // add a map directive
    const newMapDirective_create: MapDirective = {
      uuid: station.uuid,
      mapItemType: "station",
      mapAction: "createMarker",
    };
    store.dispatch(updateMapDirective(newMapDirective_create));
    await store.dispatch(thunkCancelMarkerMapDirective());
    expect(store.getState().map.mapDirective).toEqual({
      ...newMapDirective_create,
      mapAction: "cancelCreateMarker",
    });
  });
});
