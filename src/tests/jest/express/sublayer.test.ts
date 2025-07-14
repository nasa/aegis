import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import "@testing-library/jest-dom";
import { getORM, getEM, closeORM } from "utils/mikro";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import LayerFactory from "../factories/LayerFactory";
import SublayerFactory from "../factories/SublayerFactory";
import { Mission_db, Layer_db, App_User_db, Sublayer_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankSublayer } from "store/storeUtils/sublayer";

let testMissions: Mission_db[];
let testUser: App_User_db;
let testLayer: Layer_db;
let testSublayers: Sublayer_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestSublayer",
    permissionList: [
      {
        missionId: testMissions[0].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[1].id,
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
  testLayer = await new LayerFactory(em).createOne({
    mission: testMissions[0],
  });
  testSublayers = await new SublayerFactory(em)
    .each((sublayer) => {
      sublayer.mission = testMissions[0];
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
      .send({ username: testUser.username, password: "superSecretPassword" });
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
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("Returns empty non-existant sublayer uuid for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id, uuid: uuidv4() });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });

    test("Returns single sublayer by sublayer uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id, uuid: testSublayers[0].uuid });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

    test("Returns sublayers for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThan(1);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissions[2].id,
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
        missionId: testMissions[1].id,
        sublayers: [{ ...newSublayer, layerUuid: testLayer.uuid }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new sublayer", async () => {
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissions[0].id,
        sublayers: [{ ...newSublayer, layerUuid: testLayer.uuid, missionId: testMissions[0].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newSublayer = { ...res.body.data[0] };

      //check if it was added to the db
      const em = getEM();
      const sublayerRef = await em.findOne(Sublayer_db, res.body.data[0].uuid);
      expect(sublayerRef).not.toBeNull();
    });

    test("Update a sublayer", async () => {
      newSublayer.name = "Jest Test Sublayer Modified";
      newSublayer.missionId = testMissions[0].id;
      const requestBody: SublayerUpsertRequest = {
        missionId: testMissions[0].id,
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
        missionId: testMissions[2].id,
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
        missionId: testMissions[1].id,
        sublayerUuids: [newSublayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/sublayer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a sublayer", async () => {
      newSublayer.missionId = testMissions[0].id;
      const requestBody: SublayerDeleteRequest = {
        missionId: testMissions[0].id,
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
  const em = getEM();
  for (let i = 0; i < testSublayers.length; i++) {
    await em.nativeDelete(Sublayer_db, { uuid: testSublayers[i].uuid });
  }
  await em.nativeDelete(Layer_db, { uuid: testLayer.uuid });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(App_User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
