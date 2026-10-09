import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import type { App_User_db } from "server/database/models/_allModels";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import supertest from "supertest";
import app from "server/express/restApi";

let testAppUser: App_User_db;
const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "VitestSTMRules",
    permissionList: [
      {
        missionId: testMissionIds[0],
        permissions: {
          edit: true,
          view: true,
        },
      },
      {
        missionId: testMissionIds[1],
        permissions: {
          edit: false,
          view: true,
        },
      },
    ],
  });
});

describe("STM API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;

  test("Returns auth failure", async () => {
    const res = await supertest(app).get("/api/v1/stmRules");
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
    test("No permissions", async () => {
      const res = await supertest(app)
        .get("/api/v1/stmRules")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .query({ missionId: testMissionIds[2] });

      expect(res.statusCode).toBe(401);
    });
  });
});

afterAll(async () => {
  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
