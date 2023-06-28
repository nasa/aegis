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
import handleEva from "pages/api/eva";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { Eva as Eva_db } from "server/database/models/eva.model";
import EvaFactory from "../factories/EVAFactory";
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testMission: Mission_db;
let testEvas: Eva_db[];

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
  testEvas = await new EvaFactory(em)
    .each((eva) => {
      eva.mission = testMission;
      eva.owner = testAdmin;
    })
    .create(5);
});

describe("EVA API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newEVA: Eva = {
    uuid: null,
    ownerId: null,
    missionId: null,
    name: "Jest Eva-1",
    status: "Candidate",
    sequence: null,
    description: "",
    maxDuration: null,
    traverseRate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleEva(req, res);
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

  test("Returns single EVA Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id, uuid: testEvas[0].uuid },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleEva(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(1);
  });

  test("Returns all EVAs Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleEva(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toBeGreaterThan(1);
  });

  test("Fails to find single EVA", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: "99999" },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleEva(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(0);
  });

  //upsert and delete tests must occur in order
  test("Create new EVA", async () => {
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: { ...newEVA, missionId: testMission.id, ownerId: testAdmin.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleEva(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedEVA = res._getJSONData().data;
    expect(upsertedEVA.uuid).not.toBeNull();
    expect(upsertedEVA.createdAt).not.toBeNull();
    expect(upsertedEVA.updatedAt).not.toBeNull();
    newEVA = { ...upsertedEVA };

    //check if it was added to the db
    const em = getEM();
    const evaReference = await em.findOne(Eva_db, upsertedEVA.uuid);
    expect(evaReference).not.toBeNull();
  });

  test("Update a EVA", async () => {
    newEVA.name = "Jest Test New EVA Modified";
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: newEVA,
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleEva(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedEVA = res._getJSONData().data;
    expect(upsertedEVA).not.toBeNull();
    expect(upsertedEVA.name).toEqual("Jest Test New EVA Modified");
  });

  test("Delete a EVA", async () => {
    const reqOptions: RequestOptions = {
      method: "DELETE",
      headers: { cookie: loginCookie },
      query: { uuid: `${newEVA.uuid}`, missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleEva(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testEvas.length; i++) {
    await em.nativeDelete(Eva_db, { uuid: testEvas[i].uuid });
  }
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  closeORM();
});
