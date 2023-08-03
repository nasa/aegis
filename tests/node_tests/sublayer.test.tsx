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
import LayerFactory from "../factories/LayerFactory";
import SublayerFactory from "../factories/SublayerFactory";
import handleSublayer from "pages/api/sublayer";
import { Mission as Mission_db } from "server/database/models/mission.model";
import { User as User_db } from "server/database/models/user.model";
import { Layer as Layer_db } from "server/database/models/layer.model";
import { Sublayer as Sublayer_db } from "server/database/models/sublayer.model";
import { createNewSublayer } from "components/admin/helper";
import fetchMock from "jest-fetch-mock";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testMissions: Mission_db[];
let testUser: User_db;
let testLayer: Layer_db;
let testSublayers: Sublayer_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
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

  fetchMock.resetMocks();
});

describe("Layer API Endpoint ", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newSublayer: Sublayer = createNewSublayer(uuidv4());

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleSublayer(req, res);
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
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Returns empty non-existant sublayer uuid for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, uuid: uuidv4() },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const sublayers: Sublayer[] = res._getJSONData().data;
      expect(res._getJSONData().status).toBe("success");
      expect(sublayers.length).toEqual(0);
    });

    test("Returns single sublayer by sublayer uuid", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, uuid: testSublayers[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const sublayers: Sublayer[] = res._getJSONData().data;
      expect(res._getJSONData().status).toBe("success");
      expect(sublayers.length).toEqual(1);
    });

    test("Returns sublayers for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const sublayers: Sublayer[] = res._getJSONData().data;
      expect(res._getJSONData().status).toBe("success");
      expect(sublayers.length).toBeGreaterThan(1);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newSublayer, layerUuid: testLayer.uuid, missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newSublayer, layerUuid: testLayer.uuid, missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new sublayer", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newSublayer, layerUuid: testLayer.uuid, missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSublayer: Sublayer = res._getJSONData().data;
      expect(upsertedSublayer.uuid).not.toBeNull();
      expect(upsertedSublayer.createdAt).not.toBeNull();
      expect(upsertedSublayer.updatedAt).not.toBeNull();
      newSublayer = { ...upsertedSublayer };

      //check if it was added to the db
      const em = getEM();
      const sublayerRef: Sublayer_db = await em.findOne(Sublayer_db, upsertedSublayer.uuid);
      expect(sublayerRef).not.toBeNull();
    });

    test("Update a sublayer", async () => {
      newSublayer.name = "Jest Test Sublayer Modified";
      newSublayer.missionId = testMissions[0].id;

      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: newSublayer,
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedSublayer: Sublayer = res._getJSONData().data;
      expect(upsertedSublayer).not.toBeNull();
      expect(upsertedSublayer.name).toEqual("Jest Test Sublayer Modified");
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
      await handleSublayer(req, res);
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
      await handleSublayer(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a sublayer", async () => {
      newSublayer.missionId = testMissions[0].id;

      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { uuid: `${newSublayer.uuid}`, missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleSublayer(req, res);
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
  for (let i = 0; i < testSublayers.length; i++) {
    await em.nativeDelete(Sublayer_db, { uuid: testSublayers[i].uuid });
  }
  await em.nativeDelete(Layer_db, { uuid: testLayer.uuid });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });
  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
