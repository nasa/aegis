import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { User_db, Mission_db, Station_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import StationFactory from "../factories/StationFactory";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankStation } from "store/storeUtils/station";
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
let testStations: Station_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "JestStation",
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
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newStation: Station = generateBlankStation({ name: "Jest Station-1" });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/station");
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
        .get("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("Returns single station by station uuid", async () => {
      const res = await supertest(app)
        .get("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id, uuid: testStations[0].uuid });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

    test("Returns all stations for a mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThan(1);
    });

    test("No stations returned", async () => {
      const res = await supertest(app)
        .get("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order.
  describe("POST request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id })
        .send([{ ...newStation, missionId: testMissions[2].id }]);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id })
        .send([{ ...newStation, missionId: testMissions[1].id }]);

      expect(res.statusCode).toBe(401);
    });

    test("Create new station", async () => {
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id })
        .send([{ ...newStation, missionId: testMissions[0].id, ownerId: testUser.id }]);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].uuid).not.toBeNull();
      newStation = { ...res.body.data[0] };

      //check if it was added to the db
      const em = getEM();
      const stationReference = await em.findOne(Station_db, res.body.data[0].uuid);
      expect(stationReference).not.toBeNull();
    });

    test("Update a station", async () => {
      newStation.name = "Jest Test New Station Modified";
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id })
        .send([newStation]);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Jest Test New Station Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id });

      expect(res.statusCode).toBe(401);
    });

    test("Delete a station", async () => {
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id })
        .send([newStation.uuid]);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
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

  jest.restoreAllMocks();
});
