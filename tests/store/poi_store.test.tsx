import { upsertPoi } from "store/poi";
import { createTestPoi } from "../factories/PoiFactory";
import createTestStore from "../factories/makeTestStore";
import { StoreType } from "store";

let store: StoreType;
let testPoi: POI;

beforeAll(() => {
  //populate the poi state in the store
  testPoi = createTestPoi();
  store = createTestStore({
    poi: {
      pois: [testPoi],
      poisFromDb: [],
      selectedPoiUuid: null,
      selectedRightNavItem: "info_panel",
      poisEditing: [],
      calculatedFields: [],
    },
  });
});

describe("POI Store Reducers", () => {
  it("upsert poi", async () => {
    //upsert a new poi
    const newPoi: POI = createTestPoi();
    let poiCount = store.getState().poi.pois.length;
    store.dispatch(upsertPoi(newPoi));
    expect(store.getState().poi.pois.length).toEqual(poiCount + 1);

    //upsert to an existing poi
    poiCount = store.getState().poi.pois.length;
    const existingPoi = store.getState().poi.pois.find((p) => p.uuid === testPoi.uuid);
    const existingPoiUpdatedDate = existingPoi.updatedAt;
    expect(existingPoi.description).toEqual("");

    //perform the upsert
    store.dispatch(upsertPoi({ ...existingPoi, description: "modified description test" }, true));

    //get new state and run checks
    let updatedPoi = store.getState().poi.pois.find((p) => p.uuid === testPoi.uuid);
    expect(updatedPoi.description).toEqual("modified description test"); //description was upserted
    expect(updatedPoi.updatedAt).toEqual(existingPoiUpdatedDate); //preserved modified date
    expect(store.getState().poi.pois.length).toEqual(poiCount); //no new pois were added

    //upsert again but with do not preserving modified date
    store.dispatch(upsertPoi({ ...existingPoi, description: "modified description test 2" }));
    updatedPoi = store.getState().poi.pois.find((p) => p.uuid === testPoi.uuid);
    expect(updatedPoi.description).toEqual("modified description test 2"); //description was upserted
    expect(updatedPoi.updatedAt).not.toEqual(existingPoiUpdatedDate); //did not preserve modified date
    expect(store.getState().poi.pois.length).toEqual(poiCount); //no new pois were added
  });
});
