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
import handleTraverse from "pages/api/traverse";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { Traverse as Traverse_db } from "server/database/models/traverse.model";
import TraverseFactory from "../factories/TraverseFactory";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
let testTraverses: Traverse_db[];

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
  testTraverses = await new TraverseFactory(em)
    .each((traverse) => {
      traverse.mission = testMissions[0];
    })
    .create(2);
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
    predictedDurationLower: 0,
    predictedDurationUpper: 0,
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
      await handleTraverse(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Returns single Traverse by traverse uuid", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, uuid: testTraverses[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleTraverse(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns all Traverses for mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleTraverse(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBeGreaterThan(1);
    });

    test("No traverses returned", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleTraverse(req, res);
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
        body: { ...newTraverse, missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleTraverse(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newTraverse, missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleTraverse(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new Traverse", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newTraverse, missionId: testMissions[0].id, ownerId: testUser.id },
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
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleTraverse(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a Traverse", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { uuid: `${newTraverse.uuid}`, missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleTraverse(req, res);
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
  for (let i = 0; i < testTraverses.length; i++) {
    await em.nativeDelete(Traverse_db, { uuid: testTraverses[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
