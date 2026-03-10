import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import AppUserFactory from "../factories/AppUserFactory";
import LayerFactory from "../factories/LayerFactory";
import { Layer_db, App_User_db } from "server/database/models/_allModels";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankLayer } from "store/storeUtils/layer";

let testAppUser: App_User_db;
let testLayers: Layer_db[];
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "Jestlayer",
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

  testLayers = await new LayerFactory(em)
    .each((layer) => {
      layer.missionId = testMissionIds[0];
    })
    .create(2);
});

describe("Layer API Endpoint ", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newLayer: Layer = generateBlankLayer();

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[1],
        layers: [newLayer],
      };
      const res = await supertest(app)
        .post("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
      newLayer.name = "Jest Test Layer Modified";
      newLayer.missionId = testMissionIds[0];
      const requestBody: LayerUpsertRequest = {
        missionId: testMissionIds[0],
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
        missionId: testMissionIds[2],
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
        missionId: testMissionIds[1],
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
        missionId: testMissionIds[0],
        layerUuids: [newLayer.uuid],
      };
      newLayer.missionId = testMissionIds[0];

      const res = await supertest(app)
        .delete("/api/v1/layer")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
