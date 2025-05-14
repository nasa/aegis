import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { Mission_db, User_db } from "server/database/models/_allModels";
import MissionFactory from "../factories/MissionFactory";
import UserFactory from "../factories/UserFactory";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
import { generateBlankMission, convertMissionsTypeDbToStore } from "store/storeUtils/mission";
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
  };
});

let testMissions: Mission_db[];
let testAdmin: User_db;
let testSuperAdmin: User_db;
let newMission: Mission = generateBlankMission();

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testAdmin = await new UserFactory(em).createOne({
    username: "JesttestAdminForMission",
    isAdmin: true,
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
      {
        missionId: 99999,
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
  testSuperAdmin = await new UserFactory(em).createOne({
    username: "JesttestSuperAdminForMission",
    isSuperAdmin: true,
  });

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("Mission API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;
  newMission = generateBlankMission({ name: "Jest Mission-1" });

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/mission");
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAdmin.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200); //check response from login
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("GET request", () => {
    test("Returns single mission", async () => {
      const res = await supertest(app)
        .get("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[0].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

    test("Returns all missions user has permissions to - no mission id", async () => {
      const res = await supertest(app)
        .get("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(2);
    });

    test("Returns all missions user has permissions to - Invalid mission id", async () => {
      const res = await supertest(app)
        .get("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: "invalid" });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(2);
    });

    test("No mission returned - no permission", async () => {
      const res = await supertest(app)
        .get("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissions[2].id });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
    });

    test("No mission returned - doesn't exist", async () => {
      const res = await supertest(app)
        .get("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: "99999" });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(0);
    });
  });

  //upsert and delete tests must occur in order
  describe("POST request", () => {
    test("No permissions", async () => {
      const requestBody: MissionUpsertRequest = {
        socketId: "someSocketId",
        missions: convertMissionsTypeDbToStore([testMissions[2]]),
      };
      const res = await supertest(app)
        .post("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: MissionUpsertRequest = {
        socketId: "someSocketId",
        missions: convertMissionsTypeDbToStore([testMissions[1]]),
      };
      const res = await supertest(app)
        .post("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Create new mission - No permissions", async () => {
      const requestBody: MissionUpsertRequest = {
        socketId: "someSocketId",
        missions: [newMission],
      };
      const res = await supertest(app)
        .post("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("Update a mission", async () => {
      testMissions[0].name = "Jest Mission-1 Modified";
      const requestBody: MissionUpsertRequest = {
        socketId: "someSocketId",
        missions: convertMissionsTypeDbToStore([testMissions[0]]),
      };
      const res = await supertest(app)
        .post("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).not.toBeNull();
      const upsertedMission = res.body.data[0];
      expect(upsertedMission).not.toBeNull();
      expect(upsertedMission.version).toEqual(1);
      expect(upsertedMission.name).toEqual("Jest Mission-1 Modified");
    });
  });

  describe("DELETE request", () => {
    test("No permissions", async () => {
      const requestBody: MissionDeleteRequest = {
        missionIds: [testMissions[2].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - View only", async () => {
      const requestBody: MissionDeleteRequest = {
        missionIds: [testMissions[1].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
    });

    test("No permissions - Regular admin with edit permissions cannot delete", async () => {
      const requestBody: MissionDeleteRequest = {
        missionIds: [testMissions[0].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
    });
  });

  describe("Super Admin", () => {
    test("Login as super admin", async () => {
      await supertest(app).get("/api/v1/auth/logout");

      const res = await supertest(app)
        .post("/api/v1/auth/login")
        .send({ username: testSuperAdmin.username, password: "superSecretPassword" });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.data.user.isSuperAdmin).toBeTruthy();
      aegisSessionCookie = res.header["set-cookie"][0];
      aegisSessionSigCookie = res.header["set-cookie"][1];
    });

    test("Create new mission", async () => {
      const res = await supertest(app)
        .post("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ missions: [newMission] });

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].id).not.toBeNull();
      expect(res.body.data[0].version).toEqual(1);

      //check if it was added to the db
      const em = getEM();
      const missionReference = await em.findOne(Mission_db, res.body.data[0].id);
      expect(missionReference).not.toBeNull();
      newMission = { ...res.body.data[0] };
    });

    test("Update a mission", async () => {
      newMission.name = "Mission Jest Test Modified";
      const res = await supertest(app)
        .post("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ missions: [newMission] });

      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].version).toEqual(2);
      expect(res.body.data[0].name).toEqual("Mission Jest Test Modified");
    });

    test("Delete a mission", async () => {
      const res = await supertest(app)
        .delete("/api/v1/mission")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ missionIds: [newMission.id] });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");

      // Verify the mission was actually deleted from the database
      const em = getEM();
      const deletedMission = await em.findOne(Mission_db, newMission.id);
      expect(deletedMission).toBeNull();
    });
  });

  describe("Auth with emss-token header", () => {
    test("GET request returns success with valid 'emss-token' header", async () => {
      const res = await supertest(app)
        .get("/api/v1/mission")
        .set("emss-token", process.env.EMSS_TOKEN)
        .query({ missionId: testMissions[1].id });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

    test("POST request returns success with valid 'emss-token' header", async () => {
      testMissions[1].name = "Jest Mission-1 Modified via token";
      const requestBody: MissionUpsertRequest = {
        socketId: "someSocketId",
        missions: convertMissionsTypeDbToStore([testMissions[1]]),
      };
      const res = await supertest(app)
        .post("/api/v1/mission")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data).not.toBeNull();
      const upsertedMission = res.body.data[0];
      expect(upsertedMission).not.toBeNull();
      expect(upsertedMission.version).toEqual(1);
      expect(upsertedMission.name).toEqual("Jest Mission-1 Modified via token");
    });

    test("DELETE request returns failure with valid 'emss-token' header", async () => {
      const requestBody: MissionDeleteRequest = {
        missionIds: [testMissions[1].id],
      };
      const res = await supertest(app)
        .delete("/api/v1/mission")
        .set("emss-token", process.env.EMSS_TOKEN)
        .send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  await em.nativeDelete(User_db, { id: testAdmin.id });
  await em.nativeDelete(User_db, { id: testSuperAdmin.id });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
