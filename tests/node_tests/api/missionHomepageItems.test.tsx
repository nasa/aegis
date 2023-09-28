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
import logout from "pages/api/auth/logout";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleMissionHomePageItems from "pages/api/missionHomepageItems";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../../factories/UserFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../../factories/MissionFactory";
import { Rex as Rex_db } from "server/database/models/rex.model";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
import * as SocketIo from "pages/api/socketio";
import RexFactory from "../../factories/RexFactory";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUserNoPerms: User_db;
let testUser: User_db;
let testSuperAdmin: User_db;
let testMissions: Mission_db[];
let testRexes: Rex_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUserNoPerms = await new UserFactory(em).createOne({
    username: "testNoPerms",
  });
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
          view: false,
        },
      },
    ],
  });
  testSuperAdmin = await new UserFactory(em).createOne({
    username: "testSuperAdmin",
    isSuperAdmin: true,
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
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleMissionHomePageItems(req, res);
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
    test("User with viewable missions", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMissionHomePageItems(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Login as super admin", async () => {
      const logoutReqRes = mockRequestResponse({ method: "GET" });
      await logout(logoutReqRes.req, logoutReqRes.res);

      const loginReqRes = mockRequestResponse({
        method: "POST",
        body: { username: testSuperAdmin.username, password: "superSecretPassword" },
      });
      await login(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200); //check response from login
      const response: WrappedResponse<IronSessionData> = loginReqRes.res._getJSONData();
      expect(response.status).toEqual("success");
      expect(response.data.user.isSuperAdmin).toBeTruthy();
      loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
    });

    test("User with all missions", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMissionHomePageItems(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBeGreaterThan(1);
    });

    test("Login as user with no viewable missions", async () => {
      const logoutReqRes = mockRequestResponse({ method: "GET" });
      await logout(logoutReqRes.req, logoutReqRes.res);

      const loginReqRes = mockRequestResponse({
        method: "POST",
        body: { username: testUserNoPerms.username, password: "superSecretPassword" },
      });
      await login(loginReqRes.req, loginReqRes.res);
      expect(loginReqRes.res.statusCode).toBe(200); //check response from login
      const response: WrappedResponse<IronSessionData> = loginReqRes.res._getJSONData();
      expect(response.status).toEqual("success");
      expect(response.data.user.isSuperAdmin).toBeFalsy();
      loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
    });

    test("User with no viewable missions", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMissionHomePageItems(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("failure");
      expect(wrappedResponse.message).toBe("Unauthorized");
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
  await em.nativeDelete(User_db, { id: testSuperAdmin.id });
  await em.nativeDelete(User_db, { id: testUserNoPerms.id });
  // Closing the DB connection allows Jest to exit successfully.
  closeORM();

  jest.resetAllMocks();
});
