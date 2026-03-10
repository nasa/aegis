import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import AppUserFactory from "../factories/AppUserFactory";
import LayerFactory from "../factories/LayerFactory";
import SublayerFactory from "../factories/SublayerFactory";
import { Layer_db, App_User_db, Sublayer_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankSublayer } from "store/storeUtils/sublayer";

let testAppUser: App_User_db;
let testLayer: Layer_db;
let testSublayers: Sublayer_db[];
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "JestSublayer",
    permissionList: [
      {
        missionId: testMissionIds[0],
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissionIds[1],
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
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
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newSublayer: Sublayer = generateBlankSublayer({ layerUuid: uuidv4() });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/sublayer");
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissionIds[2] });

      expect(res.statusCode).toBe(401);
    });

    test("Returns empty non-existent sublayer uuid for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissionIds[0], uuid: uuidv4() });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });

    test("Returns single sublayer by sublayer uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissionIds[0], uuid: testSublayers[0].uuid });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

    test("Returns sublayers for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
      newSublayer.name = "Jest Test Sublayer Modified";
      newSublayer.missionId = testMissionIds[0];
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissionIds[0],
        sublayers: [newSublayer],
      };

      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Jest Test Sublayer Modified");
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
