import { describe, expect, afterAll, beforeAll, test } from "@jest/globals";
import "@testing-library/jest-dom";
import { NextApiRequest, NextApiResponse } from "next";
import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import Login from "pages/api/auth/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import handleLayer from "pages/api/layer";
import LayerFactory from "../factories/LayerFactory";
import { Mission_db, Layer_db, User_db } from "server/database/models/_allModels";
import { createNewLayer } from "components/admin/helper";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";

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
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newLayer: Layer = createNewLayer();

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleLayer(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Returns login session", async () => {
    const loginReqRes = mockRequestResponse({
      method: "POST",
      body: { username: testUser.username, password: "superSecretPassword" },
    });
    await Login(loginReqRes.req, loginReqRes.res);
    expect(loginReqRes.res.statusCode).toBe(200); //check response from login
    const response: WrappedResponse<IronSessionData> = loginReqRes.res._getJSONData();
    expect(response.status).toEqual("success");
    loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Returns empty non-existant layer uuid for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, uuid: uuidv4() },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const layers: Layer[] = res._getJSONData().data;
      expect(res._getJSONData().status).toBe("success");
      expect(layers.length).toEqual(0);
    });

    test("Returns single layer by layer uuid", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, uuid: testLayers[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const layers: Layer[] = res._getJSONData().data;
      expect(res._getJSONData().status).toBe("success");
      expect(layers.length).toEqual(1);
    });

    test("Returns layers for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const layers: Layer[] = res._getJSONData().data;
      expect(res._getJSONData().status).toBe("success");
      expect(layers.length).toBeGreaterThan(1);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [{ ...newLayer, missionId: testMissions[2].id }],
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [{ ...newLayer, missionId: testMissions[1].id }],
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new layer", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [{ ...newLayer, missionId: testMissions[0].id }],
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedLayer: Layer = res._getJSONData().data[0];
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

      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [newLayer],
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedLayer: Layer = res._getJSONData().data[0];
      expect(upsertedLayer).not.toBeNull();
      expect(upsertedLayer.name).toEqual("Jest Test Layer Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a layer", async () => {
      newLayer.missionId = testMissions[0].id;

      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
        body: [newLayer.uuid],
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
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
