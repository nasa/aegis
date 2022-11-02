// import { Provider } from "react-redux";
// import configureStore from "redux-mock-store";
// import { setLayers } from "../../store/mission";
// import reducer, { initialState, setLayerControls } from "../../store/map";
import { describe } from "@jest/globals";
// import { render } from "@testing-library/react";
// import Main from "../../components/panes/map_selector/map_selector";
// import Mikro from "../../utils/mikro";
// import { getAllLayersByMission } from "../../pages/api/layer/[id]";
// import MissionFactory from "../helpers/MissionFactory";
// import { Mission } from "../../server/database/models/mission.model";
// import LayerFactory from "../helpers/LayerFactory";
// import { Layer } from "../../server/database/models/layer.model";

describe("Commented out tests", () => {
  it("Add 2+2", () => {
    expect(2 + 2).toBe(4);
  });
});

// let testMission: Mission;
// let testLayer: Layer[];
// beforeAll(async () => {
//   await Mikro.getORM();
//   const model = await Mikro.getEM();
//   testMission = await new MissionFactory(model).createOne();
//   testLayer = await new LayerFactory(model)
//     .each((layer) => {
//       layer.mission = testMission;
//     })
//     .create(1);
//   await Mikro.closeORM();
// });

// // describe("Preset Controls and API: ", () => {
// //   it("Display Preset Controls", async () => {
// //     const mockStore = configureStore();
// //     const layers = await getAllLayersByMission(testMission.id);

// //     const layerControls = await setLayers(layers as LayerModel[]);
// //     const configLayers = layerControls?.payload;
// //     const controls: LayerControls = {};
// //     configLayers.map((configLayer) => {
// //       controls[configLayer.config.name] = {
// //         name: configLayer.config.name,
// //         enabled: false,
// //         type: configLayer.config.type,
// //         expanded: false,
// //         mapLayerRef: null,
// //         opacity: 1,
// //       };
// //       if (configLayer.config.sublayers) {
// //         configLayer.config.sublayers.map((sublayer) => {
// //           controls[sublayer.name] = {
// //             name: sublayer.name,
// //             enabled: false,
// //             type: sublayer.type,
// //             expanded: false,
// //             mapLayerRef: null,
// //             opacity: 1,
// //           };
// //         });
// //       }
// //     });
// //     const initialStater = await reducer(initialState, setLayerControls(controls));
// //     const store = mockStore(initialStater);

// //     const { getByText } = render(
// //       <Provider store={store}>
// //         <Main />
// //       </Provider>
// //     );

// //     expect(getByText("Mission Presets")).not.toBeNull();
// //     await Mikro.closeORM();
// //   });
// // });

// afterAll(async () => {
//   //Cleanup our Database
//   await Mikro.getORM();
//   const model = await Mikro.getEM();
//   await model.nativeDelete(Layer, { uuid: testLayer[0].uuid });
//   await model.nativeDelete(Mission, { id: testMission.id });
//   // Closing the DB connection allows Jest to exit successfully.
//   await Mikro.closeORM();
// });
