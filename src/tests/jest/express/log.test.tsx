import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { User_db, Mission_db, Log_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import { TextEncoder, TextDecoder } from "util";
import { roundDateToSecond } from "utils/formatting";
import LogFactory from "../factories/LogFactory";
import { v4 as uuidv4 } from "uuid";
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
let testLog: Log_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUser = await new UserFactory(em).createOne({
    username: "Jestlog",
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
  testLog = await new LogFactory(em)
    .each((log) => {
      log.mission = testMissions[0];
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("Log API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  let newLog: Log = {
    uuid: uuidv4(),
    missionId: null,
    type: "rexUpsert",
    payloadJson: "",
    createdAt: roundDateToSecond(new Date()).toISOString(),
  };

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/log").query({ missionId: testMissions[0].id });
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
        .get("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });
      expect(res.statusCode).toBe(401);
    });

    test("No Mission Id", async () => {
      const res = await supertest(app)
        .get("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);
      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toBe("Invalid mission ID");
    });

    test("Returns all Logs for mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThan(1);
    });

    test("No Logs returned", async () => {
      const res = await supertest(app)
        .get("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[1].id });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: LogUpsertRequest = {
        missionId: testMissions[2].id,
        logs: [newLog],
      };
      const res = await supertest(app)
        .post("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: LogUpsertRequest = {
        missionId: testMissions[1].id,
        logs: [newLog],
      };
      const res = await supertest(app)
        .post("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new Log", async () => {
      const requestBody: LogUpsertRequest = {
        missionId: testMissions[0].id,
        logs: [{ ...newLog, missionId: testMissions[0].id }],
      };
      const res = await supertest(app)
        .post("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const upsertedLog = res.body.data[0];
      expect(upsertedLog.uuid).not.toBeNull();
      newLog = { ...upsertedLog };

      //check if it was added to the db
      const em = getEM();
      const logReference = await em.findOne(Log_db, upsertedLog.uuid);
      expect(logReference).not.toBeNull();
    });

    test("Update a Log", async () => {
      newLog.type = "stationUpsert";
      const requestBody: LogUpsertRequest = {
        missionId: testMissions[0].id,
        logs: [newLog],
      };
      const res = await supertest(app)
        .post("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);

      const upsertedLog = res.body.data[0];
      expect(upsertedLog).not.toBeNull();
      expect(upsertedLog.type).toEqual("stationUpsert");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: LogDeleteRequest = {
        missionIds: [testMissions[2].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: LogDeleteRequest = {
        missionIds: [testMissions[1].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(401);
    });

    test("Delete Logs for a mission", async () => {
      const requestBody: LogDeleteRequest = {
        missionIds: [testMissions[0].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");

      //check if it was deleted from db
      const em = getEM();
      const logReference = await em.find(Log_db, { mission: testMissions[0].id });
      expect(logReference.length).toEqual(0);
    });

    test("Delete Logs for a mission with no logs", async () => {
      const requestBody: LogDeleteRequest = {
        missionIds: [testMissions[0].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/log")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("No logs found. Nothing deleted");

      //check if it was deleted from db
      const em = getEM();
      const logReference = await em.find(Log_db, { mission: testMissions[0].id });
      expect(logReference.length).toEqual(0);
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testLog.length; i++) {
    await em.nativeDelete(Log_db, { uuid: testLog[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
