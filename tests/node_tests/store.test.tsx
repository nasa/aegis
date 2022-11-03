import reducer, {
  initialState,
  setLayerControls,
  toggleLayerControlEnabled,
  toggleLayerControlExpanded,
} from "../../store/map";
import { setLayers } from "../../store/mission";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import Mikro from "../../utils/mikro";
import { getAllLayersByMission } from "../../pages/api/layer/[id]";
import UserFactory from "../helpers/UserFactory";
import MissionFactory from "../helpers/MissionFactory";
import { Mission } from "../../server/database/models/mission.model";
import { User } from "../../server/database/models/user.model";
import { Layer } from "../../server/database/models/layer.model";
import LayerFactory from "../helpers/LayerFactory";

let testMission: Mission;
let testAdmin: User;
let testLayer: Layer[];

beforeAll(async () => {
  await Mikro.getORM();
  const model = await Mikro.getEM();
  testAdmin = await new UserFactory(model).createOne();
  testMission = await new MissionFactory(model).createOne();
  testLayer = await new LayerFactory(model)
    .each((layer) => {
      layer.mission = testMission;
    })
    .create(1);
  await Mikro.closeORM();
});

describe("Map and MMGIS Reducer: ", () => {
  it("should return the initial state on first run", () => {
    // Arrange
    const nextState = initialState;

    // Act
    const result = reducer(undefined, {
      type: undefined,
    });

    // Assert
    expect(result).toEqual(nextState);
  });

  it("Set the State when loading Map layer", async () => {
    // Arrange
    const layers = await getAllLayersByMission(testMission.id);
    const configLayers = await setLayers(layers as LayerModel[]);
    const controls: LayerControls = {};
    // Act
    configLayers.payload.map((configLayer) => {
      controls[configLayer.config.name] = {
        name: configLayer.config.name,
        enabled: false,
        type: configLayer.config.type,
        expanded: false,
        mapLayerRef: null,
        style: null,
      };
      if (configLayer.config.sublayers) {
        configLayer.config.sublayers.map((sublayer) => {
          controls[sublayer.name] = {
            name: sublayer.name,
            enabled: false,
            type: sublayer.type,
            expanded: false,
            mapLayerRef: null,
            style: null,
          };
        });
      }
    });

    const newControls = {
      payload: controls,
      type: "map/setLayerControls",
    };

    const newToggleLayerControlEnabled = {
      payload: "Basemaps",
      type: "map/toggleLayerControlEnabled",
    };
    const newToggleLayerControlExpanded = {
      payload: "Basemaps",
      type: "map/toggleLayerControlExpanded",
    };

    const nextLayerControls = await reducer(initialState, setLayerControls(controls));
    expect(setLayerControls(nextLayerControls.layerControls)).toMatchObject(newControls);
    expect(toggleLayerControlEnabled("Basemaps")).toMatchObject(newToggleLayerControlEnabled);
    expect(toggleLayerControlExpanded("Basemaps")).toMatchObject(newToggleLayerControlExpanded);
    await Mikro.closeORM();
  });
});

afterAll(async () => {
  //Cleanup our Database
  await Mikro.getORM();
  const model = await Mikro.getEM();
  await model.nativeDelete(Layer, { uuid: testLayer[0].uuid });
  await model.nativeDelete(Mission, { id: testMission.id });
  await model.nativeDelete(User, { id: testAdmin.id });
  // Closing the DB connection allows Jest to exit successfully.
  await Mikro.closeORM();
});
