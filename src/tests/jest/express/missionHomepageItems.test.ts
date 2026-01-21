import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, Mission_db, Rex_db } from "server/database/models/_allModels";
import AppUserFactory from "../factories/AppUserFactory";
import MissionFactory from "../factories/MissionFactory";
import RexFactory from "../factories/RexFactory";
import supertest from "supertest";
import app from "server/express/restApi";
// suppress socketio calls because they won't work during jest testing
jest.mock("server/express/sockets", () => {
  return {
    __esModule: true,
    ...jest.requireActual("server/express/sockets"),
    emitStoreUpsert: jest.fn(),
    emitStoreDelete: jest.fn(),
  };
});

let testAppUserNoPerms: App_User_db;
let testAppUser: App_User_db;
let testSuperAdmin: App_User_db;
let testMissions: Mission_db[];
let testRexes: Rex_db[];

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testMissions = await new MissionFactory(em).create(3);
  testAppUserNoPerms = await new AppUserFactory(em).createOne({
    username: "Jest testNoPerms",
  });
  testAppUser = await new AppUserFactory(em).createOne({
    username: "Jest homePageItems",
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
  testSuperAdmin = await new AppUserFactory(em).createOne({
    username: "Jest testSuperAdminForHomePageItems",
    isSuperAdmin: true,
  });

  testRexes = await new RexFactory(em)
    .each((rex) => {
      rex.mission = testMissions[0];
    })
    .create(2);
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
      .send({ username: testAppUser.username, password: "superSecretPassword" });
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
      expect(res.body.data.isSuperAdmin).toBeTruthy();
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
        .send({ username: testAppUserNoPerms.username, password: "superSecretPassword" });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toEqual("success");
      expect(res.body.data.isSuperAdmin).toBeFalsy();
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
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testRexes.length; i++) {
    await em.nativeDelete(Rex_db, { uuid: testRexes[i].uuid });
  }
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(Mission_db, { id: testMissions[i].id });
  }
  await em.nativeDelete(App_User_db, { id: testAppUser.id });
  await em.nativeDelete(App_User_db, { id: testSuperAdmin.id });
  await em.nativeDelete(App_User_db, { id: testAppUserNoPerms.id });

  // Closing the DB connection allows Jest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  jest.restoreAllMocks();
});
