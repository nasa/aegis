import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import login from "pages/api/auth/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleRex from "pages/api/rex";
import { User_db, Mission_db, Rex_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
import { roundDateToSecond } from "utils/formatting";
import RexFactory from "../factories/RexFactory";
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
let testRexes: Rex_db[];

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
  testRexes = await new RexFactory(em)
    .each((rex) => {
      rex.mission = testMissions[0];
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("REX API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newRex: Rex = {
    uuid: null,
    missionId: null,
    name: "Jest Rex-1",
    description: null,
    petStartStopTimestamp: null,
    petValueAtStartStop: null,
    petRunning: null,
    selectedRexEvaUuid: null,
    rexRunning: null,
    crewPos: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleRex(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Returns login session", async () => {
    const loginReqRes = mockRequestResponse({
      method: "POST",
      body: { username: testUser.username, password: "superSecretPassword" },
    });
    await login(loginReqRes.req, loginReqRes.res);
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
      await handleRex(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Returns all Rexes for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleRex(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBeGreaterThan(1);
    });

    test("No Rexes returned", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleRex(req, res);
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
        body: { ...newRex, missionId: testMissions[2].id },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleRex(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newRex, missionId: testMissions[1].id },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleRex(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new Rex", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newRex, missionId: testMissions[0].id },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleRex(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedRex = res._getJSONData().data;
      expect(upsertedRex.uuid).not.toBeNull();
      newRex = { ...upsertedRex };

      //check if it was added to the db
      const em = getEM();
      const rexReference = await em.findOne(Rex_db, upsertedRex.uuid);
      expect(rexReference).not.toBeNull();
    });

    test("Update a Rex", async () => {
      newRex.name = "Jest Test New Rex Modified";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: newRex,
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleRex(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedRex = res._getJSONData().data;
      expect(upsertedRex).not.toBeNull();
      expect(upsertedRex.name).toEqual("Jest Test New Rex Modified");
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
      await handleRex(req, res);
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
      await handleRex(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a Rex", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { uuid: `${newRex.uuid}`, missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleRex(req, res);
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
  for (let i = 0; i < testRexes.length; i++) {
    await em.nativeDelete(Rex_db, { uuid: testRexes[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  closeORM();

  jest.restoreAllMocks();
});
