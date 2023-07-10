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
import handleAction from "pages/api/action";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Action as Action_db } from "server/database/models/action.model";
import ActionFactory from "../factories/ActionFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testMission: Mission_db;
let testActions: Action_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMission = await new MissionFactory(em).createOne();
  testAdmin = await new UserFactory(em).createOne({
    permissionList: [
      {
        missionId: testMission.id,
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
  testActions = await new ActionFactory(em)
    .each((action) => {
      action.mission = testMission;
    })
    .create(5);
});

describe("Action API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newAction: Action = {
    uuid: null,
    missionId: null,
    poiUuid: null,
    stationUuid: null,
    name: "Jest Test New Action",
    type: "measurement",
    description: "",
    durationLower: 0,
    priorityOverride: null,
    equipmentItemsUsage: null,
    mass: null,
    status: "Candidate",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleAction(req, res);
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

  test("Returns single action Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { uuid: testActions[0].uuid, missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleAction(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(1);
  });

  test("Returns all actions Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleAction(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toBeGreaterThan(1);
  });

  test("Fails to find single action", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: "99999" },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleAction(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(0);
  });

  //upsert and delete tests must occur in order
  test("Create new action", async () => {
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: { ...newAction, missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleAction(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedAction = res._getJSONData().data;
    expect(upsertedAction.uuid).not.toBeNull();
    expect(upsertedAction.createdAt).not.toBeNull();
    expect(upsertedAction.updatedAt).not.toBeNull();
    newAction = { ...upsertedAction };

    //check if it was added to the db
    const em = getEM();
    const actionReference = await em.findOne(Action_db, upsertedAction.uuid);
    expect(actionReference).not.toBeNull();
  });

  test("Update a action", async () => {
    newAction.name = "Jest Test New Action Modified";
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: newAction,
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleAction(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedAction = res._getJSONData().data;
    expect(upsertedAction).not.toBeNull();
    expect(upsertedAction.name).toEqual("Jest Test New Action Modified");
  });

  test("Delete a action", async () => {
    const reqOptions: RequestOptions = {
      method: "DELETE",
      headers: { cookie: loginCookie },
      query: { uuid: `${newAction.uuid}`, missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleAction(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testActions.length; i++) {
    await em.nativeDelete(Action_db, { uuid: testActions[i].uuid });
  }
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
