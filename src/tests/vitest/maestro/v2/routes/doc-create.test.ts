import type { Mock } from "vitest";
import type { App_User_db } from "server/database/models/_allModels";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  asNobody,
  asUser,
  upsertAppUser,
  upsertMission,
  grantMissionPerms,
} from "../../../fixtures/access";
import supertest from "supertest";
import app from "server/express/restApi";

// Mock global fetch so we never hit the real Maestro API
global.fetch = vi.fn();

// Each test file owns its own mission id block; grants reference doc_listing_db, so a
// shared range collides when files run in parallel.
const testMissionIds = [1060, 1061, 1062];

let testAppUser: App_User_db;
const TEST_UUPIC = "vitest-doc-create";

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  for (const missionId of testMissionIds) await upsertMission(em, missionId);

  testAppUser = await upsertAppUser(em, TEST_UUPIC);
  await grantMissionPerms(em, {
    missionId: testMissionIds[0],
    userId: testAppUser.id,
    permLevel: "edit",
  });
  await grantMissionPerms(em, {
    missionId: testMissionIds[1],
    userId: testAppUser.id,
    permLevel: "viewer",
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Maegistro V2 doc/create API Endpoint", () => {
  test("Returns auth failure for a caller holding nothing", async () => {
    const res = await supertest(app)
      .post("/api/v1/maestro/v2/doc/create")
      .set(asNobody())
      .send({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  describe("POST /api/v1/maestro/v2/doc/create", () => {
    test("Returns 401 when user has no permissions for the mission", async () => {
      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set(asUser(TEST_UUPIC))
        .send({ missionId: testMissionIds[2] });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns 401 when user has view-only permissions for the mission", async () => {
      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set(asUser(TEST_UUPIC))
        .send({ missionId: testMissionIds[1] });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns 500 when EMSS_TOKEN is not configured", async () => {
      const originalToken = process.env.EMSS_TOKEN;
      delete process.env.EMSS_TOKEN;

      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set(asUser(TEST_UUPIC))
        .send({ missionId: testMissionIds[0] });

      process.env.EMSS_TOKEN = originalToken;

      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toContain("EMSS_TOKEN");
    });

    test("Forwards the Maestro response on success", async () => {
      process.env.EMSS_TOKEN = "test-emss-token";

      const mockMaestroResponse = { docId: "abc-123", status: "created" };
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockMaestroResponse),
      } as unknown as Response);

      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set(asUser(TEST_UUPIC))
        .send({ missionId: testMissionIds[0], someField: "someValue" });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockMaestroResponse);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://maestro-beta.fit.nasa.gov/api/v1/doc/create",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-api-key": "test-emss-token",
          }),
        })
      );
    });

    test("Forwards a non-ok Maestro response status", async () => {
      process.env.EMSS_TOKEN = "test-emss-token";

      const mockMaestroResponse = { error: "Not Found" };
      (global.fetch as Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve(mockMaestroResponse),
      } as unknown as Response);

      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set(asUser(TEST_UUPIC))
        .send({ missionId: testMissionIds[0] });

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual(mockMaestroResponse);
    });

    test("Returns 500 when fetch throws an error", async () => {
      process.env.EMSS_TOKEN = "test-emss-token";

      (global.fetch as Mock).mockRejectedValueOnce(new Error("Network failure"));

      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set(asUser(TEST_UUPIC))
        .send({ missionId: testMissionIds[0] });

      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toContain("Network failure");
    });
  });
});
