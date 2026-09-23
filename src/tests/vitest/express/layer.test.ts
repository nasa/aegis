import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { asUser, upsertAppUser, upsertMission, grantMissionPerms } from "../fixtures/access";
import LayerFactory from "../fixtures/entityFactories/LayerFactory";
import { Layer_db, App_User_db } from "server/database/models/_allModels";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankLayer } from "store/storeUtils/layer";

let testAppUser: App_User_db;
let testLayers: Layer_db[];
// Each test file owns its own mission id block; grants reference doc_listing_db, so a
// shared range collides when files run in parallel.
const testMissionIds = [1020, 1021, 1022];
const TEST_UUPIC = "vitest-layer";

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  for (const missionId of testMissionIds) await upsertMission(em, missionId);

  testAppUser = await upsertAppUser(em, TEST_UUPIC, { displayName: "Vitest Layer" });
  await grantMissionPerms(em, {
    missionId: testMissionIds[0],
    userId: testAppUser.id,
    permLevel: "edit",
  });
  await grantMissionPerms(em, {
    missionId: testMissionIds[1],
    userId: testAppUser.id,
    permLevel: "viewer",
  });

  testLayers = await new LayerFactory(em)
    .each((layer) => {
      layer.missionId = testMissionIds[0];
    })
    .create(2);
});

describe("Layer API Endpoint ", () => {
  let newLayer: Layer = generateBlankLayer();

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[2],
        layers: [newLayer],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[1],
        layers: [newLayer],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty layers array", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[0],
        layers: [],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new layer", async () => {
      const newLayerData = {
        ...newLayer,
        missionId: testMissionIds[0],
      };
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[0],
        layers: [newLayerData],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const upsertedLayer: Layer = res.body.data[0];
      expect(upsertedLayer.uuid).not.toBeNull();
      newLayer = { ...upsertedLayer };

      //check if it was added to the db
      const em = globalValues.orm.em.fork();
      const layerRef: Layer_db = await em.findOne(Layer_db, upsertedLayer.uuid);
      expect(layerRef).not.toBeNull();
    });

    test("Update a layer", async () => {
      newLayer.name = "Vitest Test Layer Modified";
      newLayer.missionId = testMissionIds[0];
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[0],
        layers: [newLayer],
      };

      const res = await supertest(app)
        .post("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const upsertedLayer: Layer = res.body.data[0];
      expect(upsertedLayer).not.toBeNull();
      expect(upsertedLayer.name).toEqual("Vitest Test Layer Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: testMissionIds[2],
        layerUuids: [newLayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: testMissionIds[1],
        layerUuids: [newLayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a layer", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: testMissionIds[0],
        layerUuids: [newLayer.uuid],
      };
      newLayer.missionId = testMissionIds[0];

      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
    });
  });

  describe("API actions with emss-token", () => {
    test("GET request with emss-token succeeds", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .query({ missionId: testMissionIds[0] });

      expect(res.statusCode).toBe(200);
      // ...additional assertions...
    });

    test("POST request with emss-token succeeds", async () => {
      const newLayerData = {
        ...newLayer,
        missionId: testMissionIds[0],
      };
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[0],
        layers: [newLayerData],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      // ...additional assertions...
    });

    test("DELETE request with emss-token succeeds", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: testMissionIds[0],
        layerUuids: [newLayer.uuid],
      };
      newLayer.missionId = testMissionIds[0];

      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      // ...additional assertions...
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testLayers.length; i++) {
    await em.nativeDelete(Layer_db, { uuid: testLayers[i].uuid });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
