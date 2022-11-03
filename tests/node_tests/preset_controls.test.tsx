import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import "@testing-library/jest-dom";

import Mikro from "../../utils/mikro";
import UserFactory from "../helpers/UserFactory";
import MissionFactory from "../helpers/MissionFactory";
import { Mission } from "../../server/database/models/mission.model";
import { User } from "../../server/database/models/user.model";
import { getAllLayersByMission } from "../../pages/api/layer/[id]";
import LayerFactory from "../helpers/LayerFactory";
import { Layer } from "../../server/database/models/layer.model";

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

describe("Preset Controls and API: ", () => {
  // Expect a return of all layers for mission
  test("Expect If Mission Layer is empty to return null", async () => {
    const layers = await getAllLayersByMission(99999);
    await Mikro.closeORM();
    expect(layers).toBeNull();
  });

  test("Expect If Mission Layer is not empty to return layers", async () => {
    const layers = await getAllLayersByMission(testMission.id);
    expect(layers).not.toBeNull();
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
