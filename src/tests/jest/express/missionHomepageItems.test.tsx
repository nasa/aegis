import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { User_db, Mission_db, Rex_db } from "server/database/models/_allModels";
import UserFactory from "../factories/UserFactory";
import MissionFactory from "../factories/MissionFactory";
import RexFactory from "../factories/RexFactory";
import * as SocketIo from "server/express/sockets";
import supertest from "supertest";
import app from "server/express/restApi";
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
  };
});

let testUserNoPerms: User_db;
let testUser: User_db;
let testSuperAdmin: User_db;
let testMissions: Mission_db[];
let testRexes: Rex_db[];

beforeAll(async () => {
  await getORM();
  const em = getEM();
  testMissions = await new MissionFactory(em).create(3);
  testUserNoPerms = await new UserFactory(em).createOne({
    username: "JesttestNoPerms",
  });
  testUser = await new UserFactory(em).createOne({
    username: "JesthomePageItems",
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
          view: false,
        },
      },
    ],
  });
  testSuperAdmin = await new UserFactory(em).createOne({
    username: "JesttestSuperAdminForHomePageItems",
    isSuperAdmin: true,
  });

  testRexes = await new RexFactory(em)
    .each((rex) => {
      rex.mission = testMissions[0];
    })
    .create(2);

  // suppress socketio calls because they won't work during jest testing
  jest.spyOn(SocketIo, "emitStoreUpsert").mockImplementation(() => {});
  jest.spyOn(SocketIo, "emitStoreDelete").mockImplementation(() => {});
});

describe("REX API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/missionHomepageItems");
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
    test("User with viewable missions", async () => {
      const res = await supertest(app)
        .get("/api/v1/missionHomePageItems")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });

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

    test("User with all missions", async () => {
      const res = await supertest(app)
        .get("/api/v1/missionHomePageItems")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThan(1);
    });

    test("Login as user with no viewable missions", async () => {
      await supertest(app).get("/api/v1/auth/logout");

      const res = await supertest(app)
        .post("/api/v1/auth/login")
        .send({ username: testUserNoPerms.username, password: "superSecretPassword" });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.data.user.isSuperAdmin).toBeFalsy();
      aegisSessionCookie = res.header["set-cookie"][0];
      aegisSessionSigCookie = res.header["set-cookie"][1];
    });

    test("User with no viewable missions", async () => {
      const res = await supertest(app)
        .get("/api/v1/missionHomePageItems")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = getEM();
  for (let i = 0; i < testRexes.length; i++) {
    await em.nativeDelete(Rex_db, { uuid: testRexes[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(User_db, { id: testUser.id });
  await em.nativeDelete(User_db, { id: testSuperAdmin.id });
  await em.nativeDelete(User_db, { id: testUserNoPerms.id });

  // Closing the DB connection allows Jest to exit successfully.
  await closeORM();

  jest.restoreAllMocks();
});
