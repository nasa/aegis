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
import handleMission from "pages/api/mission";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
import { roundDateToSecond } from "utils/formatting";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testMissions: Mission_db[];
let testAdmin: User_db;
let testSuperAdmin: User_db;
let newMission: Partial<Mission>;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testAdmin = await new UserFactory(em).createOne({
    username: "testAdmin",
    isAdmin: true,
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
      {
        missionId: 99999,
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
  testSuperAdmin = await new UserFactory(em).createOne({
    username: "testSuperAdmin",
    isSuperAdmin: true,
  });
});

describe("Mission API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;

  newMission = {
    name: "Mission Jest Test",
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleMission(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.statusMessage).toEqual("OK");
  });

  test("Returns login session", async () => {
    const loginReqRes = mockRequestResponse({
      method: "POST",
      body: { username: testAdmin.username, password: "superSecretPassword" },
    });
    await login(loginReqRes.req, loginReqRes.res);
    expect(loginReqRes.res.statusCode).toBe(200); //check response from login
    const response: WrappedResponse<IronSessionData> = loginReqRes.res._getJSONData();
    expect(response.status).toEqual("success");
    loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
  });

  describe("GET request", () => {
    test("Returns single mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id.toString() },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns all missions user has permissions to", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(2);
    });

    test("No mission returned - no permission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("failure");
    });

    test("No mission returned - doesnt exist", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: "99999" },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
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
        body: testMissions[2],
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: testMissions[1],
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new mission - No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: newMission,
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Update a mission", async () => {
      testMissions[0].name = "Gaia-1 Modified";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: testMissions[0],
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedMission = res._getJSONData().data;
      expect(upsertedMission).not.toBeNull();
      expect(upsertedMission.version).toEqual(2);
      expect(upsertedMission.name).toEqual("Gaia-1 Modified");
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
      await handleMission(req, res);
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
      await handleMission(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a mission", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: `${testMissions[0].id}` },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
    });
  });

  describe("Super Admin", () => {
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

    test("Create new mission", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: newMission,
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedMission = res._getJSONData().data;
      expect(upsertedMission.id).not.toBeNull();
      expect(upsertedMission.version).toEqual(1);

      //check if it was added to the db
      const em = getEM();
      const missionReference = await em.findOne(Mission_db, upsertedMission.id);
      expect(missionReference).not.toBeNull();
      newMission = { ...upsertedMission };
    });

    test("Update a mission", async () => {
      newMission.name = "Mission Jest Test Modified";
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: newMission,
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedMission = res._getJSONData().data;
      expect(upsertedMission).not.toBeNull();
      expect(upsertedMission.version).toEqual(2);
      expect(upsertedMission.name).toEqual("Mission Jest Test Modified");
    });

    test("Delete a mission", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: newMission.id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleMission(req, res);
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
  await em.nativeDelete(User_db, { id: testAdmin.id });
  await em.nativeDelete(User_db, { id: testSuperAdmin.id });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
