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
import handleTraverse from "pages/api/traverse";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { Traverse as Traverse_db } from "server/database/models/traverse.model";
import TraverseFactory from "../factories/TraverseFactory";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testMission: Mission_db;
let testTraverses: Traverse_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
  testTraverses = await new TraverseFactory(em)
    .each((traverse) => {
      traverse.mission = testMission;
    })
    .create(5);
});

describe("EVA API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newTraverse: Traverse = {
    uuid: null,
    missionId: null,
    name: "Jest Traverse-1",
    path: null,
    pathSegmentDistances: [0],
    pathSegmentElevations: [[0]],
    durationLower: 0,
    durationUpper: 0,
    status: "Candidate",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleTraverse(req, res);
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

  test("Returns single Traverse Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id, uuid: testTraverses[0].uuid },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleTraverse(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(1);
  });

  test("Returns all Traverses Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleTraverse(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toBeGreaterThan(1);
  });

  test("Fails to find single Traverse", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: "99999" },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleTraverse(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(0);
  });

  //upsert and delete tests must occur in order
  test("Create new Traverse", async () => {
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: { ...newTraverse, missionId: testMission.id, ownerId: testAdmin.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleTraverse(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedTraverse = res._getJSONData().data;
    expect(upsertedTraverse.uuid).not.toBeNull();
    expect(upsertedTraverse.createdAt).not.toBeNull();
    expect(upsertedTraverse.updatedAt).not.toBeNull();
    newTraverse = { ...upsertedTraverse };

    //check if it was added to the db
    const em = getEM();
    const traverseReference = await em.findOne(Traverse_db, upsertedTraverse.uuid);
    expect(traverseReference).not.toBeNull();
  });

  test("Update a Traverse", async () => {
    newTraverse.name = "Jest Test New Traverse Modified";
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: newTraverse,
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleTraverse(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedTraverse = res._getJSONData().data;
    expect(upsertedTraverse).not.toBeNull();
    expect(upsertedTraverse.name).toEqual("Jest Test New Traverse Modified");
  });

  test("Delete a Traverse", async () => {
    const reqOptions: RequestOptions = {
      method: "DELETE",
      headers: { cookie: loginCookie },
      query: { uuid: `${newTraverse.uuid}` },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleTraverse(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testTraverses.length; i++) {
    await em.nativeDelete(Traverse_db, { uuid: testTraverses[i].uuid });
  }
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
