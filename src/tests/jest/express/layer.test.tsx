import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import "@testing-library/jest-dom";
import { getORM, getEM, closeORM } from "utils/mikro";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import LayerFactory from "../factories/LayerFactory";
import { Mission_db, Layer_db, User_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder, TextDecoder } from "util";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankLayer } from "store/storeUtils/layer";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testMissions: Mission_db[];
let testUser: User_db;
let testLayers: Layer_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "Jestlayer",
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

  testLayers = await new LayerFactory(em)
    .each((layer) => {
      layer.mission = testMissions[0];
    })
    .create(2);
});

describe("Layer API Endpoint ", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newLayer: Layer = generateBlankLayer();

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/eva");
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
        .get("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("Returns empty non-existant layer uuid for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id, uuid: uuidv4() });

      expect(res.statusCode).toBe(200);

      const layers: Layer[] = res.body.data;
      expect(res.body.status).toBe("success");
      expect(layers.length).toEqual(0);
    });

    test("Returns single layer by layer uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id, uuid: testLayers[0].uuid });

      expect(res.statusCode).toBe(200);

      const layers: Layer[] = res.body.data;
      expect(res.body.status).toBe("success");
      expect(layers.length).toEqual(1);
    });

    test("Returns layers for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(200);

      const layers: Layer[] = res.body.data;
      expect(res.body.status).toBe("success");
      expect(layers.length).toBeGreaterThan(1);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: testMissions[2].id,
        layers: [newLayer],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: testMissions[1].id,
        layers: [newLayer],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new layer", async () => {
      const newLayerData = {
        ...newLayer,
        missionId: testMissions[0].id,
      };
      const requestBody: LayerUpsertRequest = {
        missionId: testMissions[0].id,
        layers: [newLayerData],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const upsertedLayer: Layer = res.body.data[0];
      expect(upsertedLayer.uuid).not.toBeNull();
      newLayer = { ...upsertedLayer };

      //check if it was added to the db
      const em = getEM();
      const layerRef: Layer_db = await em.findOne(Layer_db, upsertedLayer.uuid);
      expect(layerRef).not.toBeNull();
    });

    test("Update a layer", async () => {
      newLayer.name = "Jest Test Layer Modified";
      newLayer.missionId = testMissions[0].id;
      const requestBody: LayerUpsertRequest = {
        missionId: testMissions[0].id,
        layers: [newLayer],
      };

      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const upsertedLayer: Layer = res.body.data[0];
      expect(upsertedLayer).not.toBeNull();
      expect(upsertedLayer.name).toEqual("Jest Test Layer Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: testMissions[2].id,
        layerUuids: [newLayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: testMissions[1].id,
        layerUuids: [newLayer.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a layer", async () => {
      const requestBody: LayerDeleteRequest = {
        missionId: testMissions[0].id,
        layerUuids: [newLayer.uuid],
      };
      newLayer.missionId = testMissions[0].id;

      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testLayers.length; i++) {
    await em.nativeDelete(Layer_db, { uuid: testLayers[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
