import {
  createMocks,
  createResponse,
  createRequest,
  RequestOptions,
  ResponseOptions,
} from "node-mocks-http";
import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import Login from "pages/api/users/login";
import { getORM, getEM, closeORM } from "utils/mikro";
import handleMission from "pages/api/mission";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testMissions: Mission_db[];
let testAdmin: User_db;
let newMission: Partial<Mission>;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(5);
  testAdmin = await new UserFactory(em).createOne({
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
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[2].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[3].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[4].id,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: 99999,
        permissions: {
          edit: true,
          view: true,
        },
      },
    ],
  });
});

describe("Mission API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  newMission = {
    name: "Mission Jest Test",
    config: null,
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
      body: { username: "testAdmin", password: "superSecretPassword" },
    });
    await Login(loginReqRes.req, loginReqRes.res);
    expect(loginReqRes.res.statusCode).toBe(200); //check response from login
    loginCookie = loginReqRes.res._getHeaders()["set-cookie"][0];
  });

  test("Returns single mission Json", async () => {
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

  test("Returns all missions Json", async () => {
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
    expect(wrappedResponse.data.length).toBeGreaterThan(1);
  });

  test("Fails to find single mission", async () => {
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

  //upsert and delete tests must occur in order
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
    expect(upsertedMission.name).toEqual("Gaia-1");
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

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(User_db, { id: testAdmin.id });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
    await em.nativeDelete(Mission_db, { id: newMission.id });
  }
  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
