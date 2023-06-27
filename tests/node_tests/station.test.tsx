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
import handleStation from "pages/api/station";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../factories/UserFactory";
import { Station as Station_db } from "server/database/models/station.model";
import StationFactory from "../factories/StationFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testAdmin: User_db;
let testMission: Mission_db;
let testStations: Station_db[];

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
  testStations = await new StationFactory(em)
    .each((station) => {
      station.mission = testMission;
      station.owner = testAdmin;
    })
    .create(5);
});

describe("Station API Endpoint", () => {
  type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
  type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

  let loginCookie: string;
  let newStation: Station = {
    uuid: null,
    ownerId: null,
    missionId: null,
    name: "Jest Station-1",
    status: "Candidate",
    description: "",
    radius: 0,
    location: null,
    elevation: null,
    icon: null,
    walkbackPath: null,
    walkbackPathSegmentDistances: [0],
    walkbackPathSegmentElevations: null,
    durationLower: 0,
    durationUpper: 0,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  function mockRequestResponse(reqOptions: RequestOptions, resOptions?: ResponseOptions) {
    const { req, res }: { req: ApiRequest; res: ApiResponse } = createMocks(reqOptions, resOptions);
    return { req, res };
  }

  test("Returns auth failure", async () => {
    const { req, res } = mockRequestResponse({ method: "GET" });
    await handleStation(req, res);
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

  test("Returns single station Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id, uuid: testStations[0].uuid },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleStation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(1);
  });

  test("Returns all stations Json", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleStation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toBeGreaterThan(1);
  });

  test("Fails to find single station", async () => {
    const reqOptions: RequestOptions = {
      method: "GET",
      headers: { cookie: loginCookie },
      query: { missionId: "99999" },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleStation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
    expect(wrappedResponse.data.length).toEqual(0);
  });

  //upsert and delete tests must occur in order
  test("Create new station", async () => {
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: { ...newStation, missionId: testMission.id, ownerId: testAdmin.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleStation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedStation = res._getJSONData().data;
    expect(upsertedStation.uuid).not.toBeNull();
    expect(upsertedStation.createdAt).not.toBeNull();
    expect(upsertedStation.updatedAt).not.toBeNull();
    newStation = { ...upsertedStation };

    //check if it was added to the db
    const em = getEM();
    const stationReference = await em.findOne(Station_db, upsertedStation.uuid);
    expect(stationReference).not.toBeNull();
  });

  test("Update a station", async () => {
    newStation.name = "Jest Test New Station Modified";
    const reqOptions: RequestOptions = {
      method: "POST",
      headers: { cookie: loginCookie },
      body: newStation,
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleStation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    expect(res._getJSONData().data).not.toBeNull();
    const upsertedStation = res._getJSONData().data;
    expect(upsertedStation).not.toBeNull();
    expect(upsertedStation.name).toEqual("Jest Test New Station Modified");
  });

  test("Delete a station", async () => {
    const reqOptions: RequestOptions = {
      method: "DELETE",
      headers: { cookie: loginCookie },
      query: { uuid: `${newStation.uuid}`, missionId: testMission.id },
    };
    const { req, res } = mockRequestResponse(reqOptions);
    await handleStation(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.statusMessage).toEqual("OK");

    const wrappedResponse = res._getJSONData();
    expect(wrappedResponse.status).toBe("success");
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testStations.length; i++) {
    await em.nativeDelete(Station_db, { uuid: testStations[i].uuid });
  }
  await em.nativeDelete(Mission_db, { id: testMission.id });
  await em.nativeDelete(User_db, { id: testAdmin.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();
});
