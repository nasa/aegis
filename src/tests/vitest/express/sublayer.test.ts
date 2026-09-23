import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  asNobody,
  asUser,
  upsertAppUser,
  upsertMission,
  grantMissionPerms,
} from "../fixtures/access";
import LayerFactory from "../fixtures/entityFactories/LayerFactory";
import SublayerFactory from "../fixtures/entityFactories/SublayerFactory";
import { Layer_db, App_User_db, Sublayer_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankSublayer } from "store/storeUtils/sublayer";

let testAppUser: App_User_db;
let testLayer: Layer_db;
let testSublayers: Sublayer_db[];
// Each test file owns its own mission id block; grants reference doc_listing_db, so a
// shared range collides when files run in parallel.
const testMissionIds = [1050, 1051, 1052];
const TEST_UUPIC = "vitest-sublayer";

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  for (const missionId of testMissionIds) await upsertMission(em, missionId);

  testAppUser = await upsertAppUser(em, TEST_UUPIC, { displayName: "Vitest Sublayer" });
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

  testLayer = await new LayerFactory(em).createOne({
    missionId: testMissionIds[0],
  });
  testSublayers = await new SublayerFactory(em)
    .each((sublayer) => {
      sublayer.missionId = testMissionIds[0];
      sublayer.layer = testLayer;
    })
    .create(2);
});

describe("Layer API Endpoint ", () => {
  let newSublayer: Sublayer = generateBlankSublayer({ layerUuid: uuidv4() });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/sublayer").set(asNobody());
    expect(res.statusCode).toBe(401);
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .query({ missionId: testMissionIds[2] });

      expect(res.statusCode).toBe(401);
    });

    test("Returns empty non-existent sublayer uuid for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .query({ missionId: testMissionIds[0], uuid: uuidv4() });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });

    test("Returns single sublayer by sublayer uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .query({ missionId: testMissionIds[0], uuid: testSublayers[0].uuid });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

    test("Returns sublayers for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .query({ missionId: testMissionIds[0] });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThan(1);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissionIds[2],
        sublayers: [{ ...newSublayer, layerUuid: testLayer.uuid }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissionIds[1],
        sublayers: [{ ...newSublayer, layerUuid: testLayer.uuid }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Empty sublayers array", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissionIds[0],
        sublayers: [],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(400);
    });

    test("Create new sublayer", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissionIds[0],
        sublayers: [{ ...newSublayer, layerUuid: testLayer.uuid, missionId: testMissionIds[0] }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newSublayer = { ...res.body.data[0] };

      //check if it was added to the db
      const em = globalValues.orm.em.fork();
      const sublayerRef = await em.findOne(Sublayer_db, res.body.data[0].uuid);
      expect(sublayerRef).not.toBeNull();
    });

    test("Update a sublayer", async () => {
      newSublayer.name = "Vitest Test Sublayer Modified";
      newSublayer.missionId = testMissionIds[0];
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissionIds[0],
        sublayers: [newSublayer],
      };

      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Vitest Test Sublayer Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: SublayerDeleteRequest = {
        missionId: testMissionIds[2],
        sublayerUuids: [newSublayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: SublayerDeleteRequest = {
        missionId: testMissionIds[1],
        sublayerUuids: [newSublayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a sublayer", async () => {
      newSublayer.missionId = testMissionIds[0];
      const requestBody: SublayerDeleteRequest = {
        missionId: testMissionIds[0],
        sublayerUuids: [newSublayer.uuid],
      };

      const res = await supertest(app)
        .delete("/api/v1/sublayer")
        .set(asUser(TEST_UUPIC))
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testSublayers.length; i++) {
    await em.nativeDelete(Sublayer_db, { uuid: testSublayers[i].uuid });
  }
  await em.nativeDelete(Layer_db, { uuid: testLayer.uuid });
  await em.nativeDelete(App_User_db, { id: testAppUser.id });

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
