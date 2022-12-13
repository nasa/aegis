import reducer, {
  initialState,
  setLayerControls,
  toggleLayerControlEnabled,
  toggleLayerControlExpanded,
} from "../../store/map";
import { setLayers } from "../../store/mission";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import Mikro from "../../utils/mikro";
import { getLayers } from "../../pages/api/layer";
import UserFactory from "../helpers/UserFactory";
import MissionFactory from "../helpers/MissionFactory";
import { Mission as Mission_db } from "../../server/database/models/mission.model";
import { User as User_db } from "../../server/database/models/user.model";
import { Layer as Layer_db } from "../../server/database/models/layer.model";
import LayerFactory from "../helpers/LayerFactory";

let testMission: Mission_db;
let testAdmin: User_db;
let testLayer: Layer_db[];

beforeAll(async () => {
  await Mikro.getORM();
  const em = Mikro.getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
  testLayer = await new LayerFactory(em)
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
    const layers: Layer[] = await getLayers(testMission.id);
    const configLayers = setLayers(layers);
    const controls: LayerControls = {};
    // Act
    configLayers.payload.map((configLayer) => {
      controls[configLayer.layerConfig.name] = {
        name: configLayer.layerConfig.name,
        enabled: false,
        type: configLayer.layerConfig.type,
        expanded: false,
        mapLayerRef: null,
        style: null,
      };
      if (configLayer.layerConfig.sublayers) {
        configLayer.layerConfig.sublayers.map((sublayer) => {
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

    const nextLayerControls = reducer(initialState, setLayerControls(controls));
    expect(setLayerControls(nextLayerControls.layerControls)).toMatchObject(newControls);
    expect(toggleLayerControlEnabled("Basemaps")).toMatchObject(newToggleLayerControlEnabled);
    expect(toggleLayerControlExpanded("Basemaps")).toMatchObject(newToggleLayerControlExpanded);
    await Mikro.closeORM();
  });
});

afterAll(async () => {
  //Cleanup our Database
  await Mikro.getORM();
  const em = Mikro.getEM();
  await em.nativeDelete(Layer_db, { uuid: testLayer[0].uuid });
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });
  // Closing the DB connection allows Jest to exit successfully.
  await Mikro.closeORM();
});
