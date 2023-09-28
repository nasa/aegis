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
import handleLog from "pages/api/log";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../../factories/UserFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../../factories/MissionFactory";
import { Log as Log_db } from "server/database/models/log.model";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
import { roundDateToSecond } from "utils/formatting";
import * as SocketIo from "pages/api/socketio";
import LogFactory from "../../factories/LogFactory";
import { v4 as uuidv4 } from "uuid";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
let testLog: Log_db[];

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
  testLog = await new LogFactory(em)
    .each((log) => {
      log.mission = testMissions[0];
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("Log API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newLog: Log = {
    uuid: uuidv4(),
    missionId: null,
    type: "rexUpsert",
    payloadJson: "",
    createdAt: roundDateToSecond(new Date()).toISOString(),
  };
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleLog(req, res);
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
      await handleLog(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Returns all Logs for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLog(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBeGreaterThan(1);
    });

    test("No Logs returned", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLog(req, res);
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
        body: { ...newLog, missionId: testMissions[2].id },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLog(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newLog, missionId: testMissions[1].id },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLog(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new Log", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newLog, missionId: testMissions[0].id },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLog(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedLog = res._getJSONData().data;
      expect(upsertedLog.uuid).not.toBeNull();
      newLog = { ...upsertedLog };

      //check if it was added to the db
      const em = getEM();
      const logReference = await em.findOne(Log_db, upsertedLog.uuid);
      expect(logReference).not.toBeNull();
    });

    test("Update a Log", async () => {
      newLog.type = "stationUpsert";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: newLog,
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLog(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedLog = res._getJSONData().data;
      expect(upsertedLog).not.toBeNull();
      expect(upsertedLog.type).toEqual("stationUpsert");
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
      await handleLog(req, res);
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
      await handleLog(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete Logs for a mission", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleLog(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");

      //check if it was deleted from db
      const em = getEM();
      const logReference = await em.find(Log_db, { mission: testMissions[0].id });
      expect(logReference.length).toEqual(0);
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testLog.length; i++) {
    await em.nativeDelete(Log_db, { uuid: testLog[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  closeORM();

  jest.resetAllMocks();
});
