import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import "@testing-library/jest-dom";

import Mikro from "../../utils/mikro";
import UserFactory from "../helpers/UserFactory";
import MissionFactory from "../helpers/MissionFactory";
import { getLayers } from "../../pages/api/layer";
import LayerFactory from "../helpers/LayerFactory";
import { Mission as Mission_db } from "../../server/database/models/mission.model";
import { User as User_db } from "../../server/database/models/user.model";
import { Layer as Layer_db } from "../../server/database/models/layer.model";

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
});

describe("Preset Controls and API: ", () => {
  // Expect a return of all layers for mission
  test("Expect If Mission Layer is empty to return empty", async () => {
    const layers: Layer[] = await getLayers(99999);
    expect(layers.length).toEqual(0);
  });

  test("Expect If Mission Layer is not empty to return layers", async () => {
    const layers: Layer[] = await getLayers(testMission.id);
    expect(layers).not.toBeNull();
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = Mikro.getEM();
  await em.nativeDelete(Layer_db, { uuid: testLayer[0].uuid });
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });
  // Closing the DB connection allows Jest to exit successfully.
  await Mikro.closeORM();
});
