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
import handlePOI from "pages/api/poi";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Poi as Poi_db } from "server/database/models/poi.model";
import PoiFactory from "../factories/PoiFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util"; //text encoder isn't defined in jest and causes Login call to fail, so import it here
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testMission: Mission_db;
let testPois: Poi_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testAdmin = await new UserFactory(em).createOne();
  testMission = await new MissionFactory(em).createOne();
  testPois = await new PoiFactory(em)
    .each((poi) => {
      poi.mission = testMission;
      poi.owner = testAdmin;
    })
    .create(5);
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
    priorityOverride: null,
    radius: 0,
    location: null,
    elevation: null,
    icon: null,
    tags: null,
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
    await handlePOI(req, res);
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

  test("Returns all Pois Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePOI(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toBeGreaterThan(1);
  });

  test("Fails to find single Poi", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: "99999" },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePOI(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(0);
  });

  //upsert and delete tests must occur in order
  test("Create new Poi", async () => {
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: { ...newPoi, missionId: testMission.id, ownerId: testAdmin.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePOI(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedPoi: POI = res._getJSONData().data;
    expect(upsertedPoi.uuid).not.toBeNull();
    expect(upsertedPoi.createdAt).not.toBeNull();
    expect(upsertedPoi.updatedAt).not.toBeNull();
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
      body: newPoi,
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePOI(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedPoi = res._getJSONData().data;
    expect(upsertedPoi).not.toBeNull();
    expect(upsertedPoi.name).toEqual("Jest New Poi Modified");
  });

  test("Delete a Poi", async () => {
    const reqOptions: RequestOptions = {
      method: "DELETE",
      headers: { cookie: loginCookie },
      query: { uuid: `${newPoi.uuid}` },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handlePOI(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testPois.length; i++) {
    await em.nativeDelete(Poi_db, { uuid: testPois[i].uuid });
  }
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
