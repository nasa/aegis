import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { MissionBackup_db, Doc_Listing_db, App_User_db } from "server/database/models/_allModels";
import MissionFactory from "../fixtures/entityFactories/MissionFactory";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import supertest from "supertest";
import app from "server/express/restApi";
// suppress socketio calls because they won't work during vitest testing
vi.mock("server/express/sockets", async () => {
  return {
    __esModule: true,
    ...(await vi.importActual("server/express/sockets")),
    emitStoreUpsert: vi.fn(),
    emitStoreDelete: vi.fn(),
  };
});

let testMissions: MissionBackup_db[];
let testAdmin: App_User_db;
let testSuperAdmin: App_User_db;

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();

  testMissions = await new MissionFactory(em).create(3);
  testAdmin = await new AppUserFactory(em).createOne({
    username: "Vitest testAdminForMission",
    isAdmin: true,
    permissionList: [
      {
        missionId: testMissions[0].missionId,
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissions[1].missionId,
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
  testSuperAdmin = await new AppUserFactory(em).createOne({
    username: "Vitest testSuperAdminForMission",
    isSuperAdmin: true,
  });
});

describe("Mission API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;

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
        .query({ missionId: testMissions[0].missionId });

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
        .query({ missionId: testMissions[2].missionId });

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

  describe("Super Admin", () => {
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
  });

  describe("Auth with emss-token header", () => {
    test("GET request returns success with valid 'emss-token' header", async () => {
      const res = await supertest(app)
        .get("/api/v1/mission")
        .set("emss-token", process.env.EMSS_TOKEN)
        .query({ missionId: testMissions[1].missionId });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toEqual(1);
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  await em.nativeDelete(App_User_db, { id: testAdmin.id });
  await em.nativeDelete(App_User_db, { id: testSuperAdmin.id });
  for (let i = 0; i < testMissions.length; i++) {
    await em.nativeDelete(MissionBackup_db, { missionId: testMissions[i].missionId });
    await em.nativeDelete(Doc_Listing_db, { missionId: testMissions[i].missionId });
  }

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
