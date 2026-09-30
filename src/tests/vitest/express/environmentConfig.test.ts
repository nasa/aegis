import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, EnvironmentConfig_db } from "server/database/models/_allModels";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { CONFIG_LIST } from "server/express/routes/environmentConfig";

let testAppUser: App_User_db;
let testSuperAdmin: App_User_db;

const CONFIG_KEY = "vitestKey";
const DEFAULT_VALUE = "vitest-default-value.example.com";
const CONFIG_KEY_2 = "vitestKey2";
const DEFAULT_VALUE_2 = "vitest-default-value-2.example.com";

beforeAll(async () => {
  // Initialize MikroORM and set it in globalValues
  globalValues.orm = await MikroORM.init(config);

  CONFIG_LIST[CONFIG_KEY] = { defaultValue: () => DEFAULT_VALUE };
  CONFIG_LIST[CONFIG_KEY_2] = { defaultValue: () => DEFAULT_VALUE_2 };

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "Vitest regular appUser for envConfig",
  });
  testSuperAdmin = await new AppUserFactory(em).createOne({
    username: "Vitest super admin for envConfig",
    isSuperAdmin: true,
  });

  // Ensure no stray overrides exist for the test keys before tests run.
  await em.nativeDelete(EnvironmentConfig_db, { key: { $in: [CONFIG_KEY, CONFIG_KEY_2] } });
});

describe("Environment Config API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;

  test("Returns auth failure - GET /", async () => {
    const res = await supertest(app).get("/api/v1/environmentConfig");
    expect(res.statusCode).toBe(401);
  });

  test("Returns auth failure - GET /:key", async () => {
    const res = await supertest(app).get(`/api/v1/environmentConfig/${CONFIG_KEY}`);
    expect(res.statusCode).toBe(401);
  });

  test("Returns auth failure - POST /:key", async () => {
    const res = await supertest(app)
      .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
      .send({ value: "someValue" });
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

  describe("Not super admin", () => {
    test("No GET permissions - list", async () => {
      const res = await supertest(app)
        .get("/api/v1/environmentConfig")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

      expect(res.statusCode).toBe(401);
    });

    test("No GET permissions - single key", async () => {
      const res = await supertest(app)
        .get(`/api/v1/environmentConfig/${CONFIG_KEY}`)
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

      expect(res.statusCode).toBe(401);
    });

    test("No POST permissions", async () => {
      const res = await supertest(app)
        .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ value: "someValue" });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("Super admin", () => {
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

    describe("GET request", () => {
      test("Returns all configs", async () => {
        const res = await supertest(app)
          .get("/api/v1/environmentConfig")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(Array.isArray(res.body.data)).toBe(true);

        const firstEntry = res.body.data.find(
          (entry: EnvironmentConfigData) => entry.key === CONFIG_KEY
        );
        expect(firstEntry).toBeDefined();
        expect(firstEntry.config).toBeNull();
        expect(firstEntry.defaultValue).toEqual(DEFAULT_VALUE);
        expect(firstEntry.effectiveValue).toEqual(DEFAULT_VALUE);
        expect(firstEntry.isOverridden).toBe(false);

        const secondEntry = res.body.data.find(
          (entry: EnvironmentConfigData) => entry.key === CONFIG_KEY_2
        );
        expect(secondEntry).toBeDefined();
        expect(secondEntry.config).toBeNull();
        expect(secondEntry.defaultValue).toEqual(DEFAULT_VALUE_2);
        expect(secondEntry.effectiveValue).toEqual(DEFAULT_VALUE_2);
        expect(secondEntry.isOverridden).toBe(false);
      });

      test("Returns single known config with no override", async () => {
        const res = await supertest(app)
          .get(`/api/v1/environmentConfig/${CONFIG_KEY}`)
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.key).toEqual(CONFIG_KEY);
        expect(res.body.data.config).toBeNull();
        expect(res.body.data.defaultValue).toEqual(DEFAULT_VALUE);
        expect(res.body.data.effectiveValue).toEqual(DEFAULT_VALUE);
        expect(res.body.data.isOverridden).toBe(false);
      });

      test("Returns 404 for unknown key", async () => {
        const res = await supertest(app)
          .get("/api/v1/environmentConfig/notARealKey")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie]);

        expect(res.statusCode).toBe(404);
        expect(res.body.status).toBe("error");
      });
    });

    describe("POST request", () => {
      test("Returns 404 for unknown key", async () => {
        const res = await supertest(app)
          .post("/api/v1/environmentConfig/notARealKey")
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send({ value: "someValue" });

        expect(res.statusCode).toBe(404);
        expect(res.body.status).toBe("error");
      });

      test("Sets an override value for a known key", async () => {
        const res = await supertest(app)
          .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send({ value: "maestro-override.example.com" });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.key).toEqual(CONFIG_KEY);
        expect(res.body.data.config?.value).toEqual("maestro-override.example.com");
        expect(res.body.data.effectiveValue).toEqual("maestro-override.example.com");
        expect(res.body.data.isOverridden).toBe(true);

        // check if it was persisted to the db
        const em = globalValues.orm.em.fork();
        const row = await em.findOne(EnvironmentConfig_db, { key: CONFIG_KEY });
        expect(row).not.toBeNull();
        expect(row?.value).toEqual("maestro-override.example.com");
      });

      test("Updates an existing override value", async () => {
        const res = await supertest(app)
          .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send({ value: "maestro-override-2.example.com" });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.config?.value).toEqual("maestro-override-2.example.com");
        expect(res.body.data.isOverridden).toBe(true);
      });

      test("Trims whitespace from the provided value", async () => {
        const res = await supertest(app)
          .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send({ value: "  maestro-trimmed.example.com  " });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.config?.value).toEqual("maestro-trimmed.example.com");
      });

      test("Clears the override when value is null", async () => {
        const res = await supertest(app)
          .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send({ value: null });

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("success");
        expect(res.body.data.config?.value).toBeNull();
        expect(res.body.data.effectiveValue).toEqual(DEFAULT_VALUE);
        expect(res.body.data.isOverridden).toBe(false);
      });

      test("Clears the override when value is an empty/whitespace string", async () => {
        // set a value first so there's something to clear
        await supertest(app)
          .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send({ value: "temporary-value" });

        const res = await supertest(app)
          .post(`/api/v1/environmentConfig/${CONFIG_KEY}`)
          .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
          .send({ value: "   " });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.config?.value).toBeNull();
        expect(res.body.data.isOverridden).toBe(false);
        expect(res.body.data.effectiveValue).toEqual(DEFAULT_VALUE);
      });
    });
  });
});

afterAll(async () => {
  //Cleanup our Database
  const em = globalValues.orm.em.fork();
  await em.nativeDelete(App_User_db, { id: testAppUser.id });
  await em.nativeDelete(App_User_db, { id: testSuperAdmin.id });
  await em.nativeDelete(EnvironmentConfig_db, { key: { $in: [CONFIG_KEY, CONFIG_KEY_2] } });

  // Remove the throwaway keys so they don't leak into other test files.
  delete CONFIG_LIST[CONFIG_KEY];
  delete CONFIG_LIST[CONFIG_KEY_2];

  // Closing the DB connection allows Vitest to exit successfully.
  await globalValues.orm.close();
  globalValues.orm = null;

  vi.restoreAllMocks();
});
