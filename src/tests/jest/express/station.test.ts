import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { User_db, Mission_db, Station_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import StationFactory from "../factories/StationFactory";
import MissionFactory from "../factories/MissionFactory";
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

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  //upsert and delete tests must occur in order.
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
        stations: [{ ...newStation, missionId: testMissions[2].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[1].id,
        stations: [{ ...newStation, missionId: testMissions[1].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new station", async () => {
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        stations: [{ ...newStation, missionId: testMissions[0].id, ownerId: testUser.id }],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

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
      const requestBody: StationUpsertRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        stations: [newStation],
      };
      const res = await supertest(app)
        .post("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0]).not.toBeNull();
      expect(res.body.data[0].name).toEqual("Jest Test New Station Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: StationDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[2].id,
        stationUuids: [newStation.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: StationDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[1].id,
        stationUuids: [newStation.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Delete a station", async () => {
      const requestBody: StationDeleteRequest = {
        socketId: "someSocketId",
        missionId: testMissions[0].id,
        stationUuids: [newStation.uuid],
      };
      const res = await supertest(app)
        .delete("/api/v1/station")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });
});

describe("Auth with emss-token header", () => {
  const emssToken = process.env.EMSS_TOKEN || "";
  let newStation: Station = generateBlankStation({ name: "Jest Station-1" });

  test("POST request succeeds with emss-token", async () => {
    const requestBody: StationUpsertRequest = {
      socketId: "someSocketId",
      missionId: testMissions[0].id,
      stations: [{ ...newStation, missionId: testMissions[0].id }],
    };
    const res = await supertest(app)
      .post("/api/v1/station")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].uuid).not.toBeNull();
    newStation = res.body.data[0];
  });

  test("DELETE request succeeds with emss-token", async () => {
    const requestBody: StationDeleteRequest = {
      socketId: "someSocketId",
      missionId: testMissions[0].id,
      stationUuids: [newStation.uuid],
    };
    const res = await supertest(app)
      .delete("/api/v1/station")
      .set("emss-token", emssToken)
      .send(requestBody);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("success");
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
