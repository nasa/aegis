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
import handleStation from "pages/api/station";
import { User as User_db } from "server/database/models/user.model";
import UserFactory from "../../factories/UserFactory";
import { Station as Station_db } from "server/database/models/station.model";
import StationFactory from "../../factories/StationFactory";
import { Mission as Mission_db } from "server/database/models/mission.model";
import MissionFactory from "../../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
import { IronSessionData } from "iron-session";
import { roundDateToSecond } from "utils/formatting";
import * as SocketIo from "pages/api/socketio";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
let testStations: Station_db[];

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
  testStations = await new StationFactory(em)
    .each((station) => {
      station.mission = testMissions[0];
      station.owner = testUser;
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
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
    actionOrderUuids: [],
    radius: 0,
    location: null,
    elevation: null,
    icon: null,
    walkbackPath: null,
    walkbackPathSegmentDistances: [0],
    walkbackPathSegmentElevations: null,
    durationLower: 0,
    durationUpper: 0,
    rexStatus: null,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
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
      await handleStation(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Returns single station by station uuid", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id, uuid: testStations[0].uuid },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns all stations for a mission", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBeGreaterThan(1);
    });

    test("No stations returned", async () => {
      const reqOptions: RequestOptions = {
        method: "GET",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      const wrappedResponse = res._getJSONData();
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order.
  describe("POST request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newStation, missionId: testMissions[2].id },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("No permissions - View only", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newStation, missionId: testMissions[1].id },
        query: { missionId: testMissions[1].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Create new station", async () => {
      const reqOptions: RequestOptions = {
        method: "POST",
        headers: { cookie: loginCookie },
        body: { ...newStation, missionId: testMissions[0].id, ownerId: testUser.id },
        query: { missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.statusMessage).toEqual("OK");

      expect(res._getJSONData().data).not.toBeNull();
      const upsertedStation = res._getJSONData().data;
      expect(upsertedStation.uuid).not.toBeNull();
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
        query: { missionId: testMissions[0].id },
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
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { missionId: testMissions[2].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
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
      await handleStation(req, res);
      expect(res.statusCode).toBe(401);
      expect(res.statusMessage).toEqual("OK");
    });

    test("Delete a station", async () => {
      const reqOptions: RequestOptions = {
        method: "DELETE",
        headers: { cookie: loginCookie },
        query: { uuid: `${newStation.uuid}`, missionId: testMissions[0].id },
      };
      const { req, res } = mockRequestResponse(reqOptions);
      await handleStation(req, res);
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
  for (let i = 0; i < testStations.length; i++) {
    await em.nativeDelete(Station_db, { uuid: testStations[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.resetAllMocks();
});
