import { upsertPois } from "store/poi";
import { createCustomTestStore } from "../factories/makeTestStore";
import type { StoreType } from "store";
import { initialState as poiInitialState } from "store/poi";
import { generateBlankPoi } from "store/storeUtils/poi";

let store: StoreType;
let testPoi: POI;

beforeAll(() => {
  //populate the poi state in the store
  testPoi = generateBlankPoi({ name: "Jest Poi-1" });
  store = createCustomTestStore({
    poi: {
      ...poiInitialState,
      pois: [testPoi],
    },
  });
});

describe("POI Store Reducers", () => {
  it("upsert poi", async () => {
    //upsert a new poi
    const newPoi: POI = generateBlankPoi({ name: "Jest Poi-1" });
    let poiCount = store.getState().poi.pois.length;
    store.dispatch(upsertPois([newPoi]));
    expect(store.getState().poi.pois.length).toEqual(poiCount + 1);

    //upsert to an existing poi
    poiCount = store.getState().poi.pois.length;
    const existingPoi = store.getState().poi.pois.find((p) => p.uuid === testPoi.uuid);
    const existingPoiUpdatedDate = existingPoi.updatedAt;
    expect(existingPoi.description).toEqual("");

    //perform the upsert
    store.dispatch(
      upsertPois([{ ...existingPoi, description: "modified description test" }], true)
    );

    //get new state and run checks
    let updatedPoi = store.getState().poi.pois.find((p) => p.uuid === testPoi.uuid);
    expect(updatedPoi.description).toEqual("modified description test"); //description was upserted
    expect(updatedPoi.updatedAt).toEqual(existingPoiUpdatedDate); //preserved modified date
    expect(store.getState().poi.pois.length).toEqual(poiCount); //no new pois were added

    //upsert again but with do not preserving modified date
    store.dispatch(upsertPois([{ ...existingPoi, description: "modified description test 2" }]));
    updatedPoi = store.getState().poi.pois.find((p) => p.uuid === testPoi.uuid);
    expect(updatedPoi.description).toEqual("modified description test 2"); //description was upserted
    expect(updatedPoi.updatedAt).not.toEqual(existingPoiUpdatedDate); //did not preserve modified date
    expect(store.getState().poi.pois.length).toEqual(poiCount); //no new pois were added
  });
});
