import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import Login from "pages/api/auth/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import handlePOI from "pages/api/poi";
import { User_db, Mission_db, Poi_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import PoiFactory from "../factories/PoiFactory";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
import { roundDateToSecond } from "utils/formatting";
import * as SocketIo from "pages/api/socketio";
jest.mock("pages/api/socketio", () => {
  return {
    __esModule: true,
    ...jest.requireActual("pages/api/socketio"),
  };
});

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
let testPois: Poi_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestPoi",
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
  testPois = await new PoiFactory(em)
    .each((poi) => {
      poi.mission = testMissions[0];
      poi.owner = testUser;
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("Poi API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newPoi: POI = {
    uuid: null,
    missionId: null,
    ownerId: null,
    name: "Jest Test New Poi",
    description: "",
    actionOrderUuids: [],
    priorityOverride: null,
    radius: 0,
    location: null,
    elevation: null,
    icon: null,
    tags: null,
    status: "Candidate",
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handlePOI(req, res);
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
      await handlePOI(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Returns all Pois for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handlePOI(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBeGreaterThan(1);
    });

    test("No Pois returned", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handlePOI(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [{ ...newPoi, missionId: testMissions[2].id }],
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handlePOI(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [{ ...newPoi, missionId: testMissions[1].id }],
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handlePOI(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new Poi", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [{ ...newPoi, missionId: testMissions[0].id, ownerId: testUser.id }],
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handlePOI(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedPoi: POI = res._getJSONData().data[0];
      expect(upsertedPoi.uuid).not.toBeNull();
      newPoi = { ...upsertedPoi };

      //check if it was added to the db
      const em = getEM();
      const poiReference = await em.findOne(Poi_db, upsertedPoi.uuid);
      expect(poiReference).not.toBeNull();
    });

    test("Update a Poi", async () => {
      newPoi.name = "Jest New Poi Modified";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: [{ ...newPoi, missionId: testMissions[0].id }],
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handlePOI(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedPoi = res._getJSONData().data[0];
      expect(upsertedPoi).not.toBeNull();
      expect(upsertedPoi.name).toEqual("Jest New Poi Modified");
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
      await handlePOI(req, res);
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
      await handlePOI(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a Poi", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
        body: [newPoi.uuid],
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handlePOI(req, res);
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
  for (let i = 0; i < testPois.length; i++) {
    await em.nativeDelete(Poi_db, { uuid: testPois[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
