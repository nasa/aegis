import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import {
  User_db,
  Action_db,
  Mission_db,
  Station_db,
  Poi_db,
} from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { TextEncoder, TextDecoder } from "util";
import { roundDateToSecond } from "utils/formatting";
import UserFactory from "../factories/UserFactory";
import ActionFactory from "../factories/ActionFactory";
import MissionFactory from "../factories/MissionFactory";
import StationFactory from "../factories/StationFactory";
import PoiFactory from "../factories/PoiFactory";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
  };
});
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

let testUser: User_db;
let testMissions: Mission_db[];
const testActions: Action_db[] = [];
let testStation: Station_db;
let testPoi: Poi_db;

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "Jestaction",
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

  testStation = await new StationFactory(em).createOne({
    mission: testMissions[0],
    owner: testUser,
  });
  testPoi = await new PoiFactory(em).createOne({
    mission: testMissions[0],
    owner: testUser,
  });
  testActions.push(
    await new ActionFactory(em).createOne({
      mission: testMissions[0],
      station: testStation,
    })
  );
  testActions.push(
    await new ActionFactory(em).createOne({
      mission: testMissions[0],
      poi: testPoi,
    })
  );

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("Action API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newAction: Action = {
    uuid: uuidv4(),
    missionId: null,
    poiUuid: null,
    stationUuid: null,
    name: "Jest Test New Action",
    type: "measurement",
    description: "",
    location: null,
    elevation: null,
    icon: null,
    durationUpper: 0,
    durationLower: 0,
    priority: null,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    mass: null,
    status: "Candidate",
    enabled: true,
    crewAssigned: [],
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/action");
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("GET request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });
      expect(res.statusCode).toBe(401);
    });

    test("Returns single action by action uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ uuid: testActions[0].uuid, missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
    });

    test("Returns single action by station uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ stationUuid: testStation.uuid, missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
      expect(wrappedResponse.data[0].stationUuid).toEqual(testStation.uuid);
    });

    test("Returns single action by poi uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ poiUuid: testPoi.uuid, missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(1);
      expect(wrappedResponse.data[0].poiUuid).toEqual(testPoi.uuid);
    });

    test("Returns all actions for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toBeGreaterThan(1);
    });

    test("No actions returned", async () => {
      const res = await supertest(app)
        .get("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id });
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
      expect(wrappedResponse.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send([{ ...newAction, missionId: testMissions[2].id }])
        .query({ missionId: testMissions[2].id });
      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send([{ ...newAction, missionId: testMissions[1].id }])
        .query({ missionId: testMissions[1].id });
      expect(res.statusCode).toBe(401);
    });

    test("Create new action", async () => {
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send([{ ...newAction, missionId: testMissions[0].id }])
        .query({ missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);

      expect(res.body.data).not.toBeNull();
      const upsertedAction = res.body.data[0];
      expect(upsertedAction.uuid).not.toBeNull();
      newAction = { ...upsertedAction };

      //check if it was added to the db
      const em = getEM();
      const actionReference = await em.findOne(Action_db, upsertedAction.uuid);
      expect(actionReference).not.toBeNull();
    });

    test("Update a action", async () => {
      newAction.name = "Jest Test New Action Modified";
      const res = await supertest(app)
        .post("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send([newAction])
        .query({ missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);

      expect(res.body.data).not.toBeNull();
      const upsertedAction = res.body.data[0];
      expect(upsertedAction).not.toBeNull();
      expect(upsertedAction.name).toEqual("Jest Test New Action Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .delete("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });
      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const res = await supertest(app)
        .delete("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id });
      expect(res.statusCode).toBe(401);
    });

    test("Delete a action", async () => {
      const res = await supertest(app)
        .delete("/api/v1/action")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send([newAction.uuid])
        .query({ missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);

      const wrappedResponse = res.body;
      expect(wrappedResponse.status).toBe("success");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testActions.length; i++) {
    await em.nativeDelete(Action_db, { uuid: testActions[i].uuid });
  }
  await em.nativeDelete(Station_db, { uuid: testStation.uuid });
  await em.nativeDelete(Poi_db, { uuid: testPoi.uuid });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
