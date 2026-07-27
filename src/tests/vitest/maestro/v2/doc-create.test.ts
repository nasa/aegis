import type { Mock } from "vitest";
import type { App_User_db } from "server/database/models/_allModels";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import AppUserFactory from "../../fixtures/entityFactories/AppUserFactory";
import supertest from "supertest";
import app from "server/express/restApi";

// Mock global fetch so we never hit the real Maestro API
global.fetch = vi.fn();

const testMissionIds = [1000, 1001, 1002]; // test mission IDs, not real missions

let testAppUser: App_User_db;

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);

  const em = globalValues.orm.em.fork();
  testAppUser = await new AppUserFactory(em).createOne({
    username: "VitestMaestro",
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Maegistro V2 doc/create API Endpoint", () => {
  let aegisSessionCookie: string;
  let aegisSessionSigCookie: string;

  test("Returns auth failure when not logged in", async () => {
    const res = await supertest(app)
      .post("/api/v1/maestro/v2/doc/create")
      .send({ missionId: testMissionIds[0] });
    expect(res.statusCode).toBe(401);
  });

  test("Returns login session", async () => {
    const res = await supertest(app)
      .post("/api/v1/auth/login")
      .send({ username: testAppUser.username, password: "superSecretPassword" });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toEqual("success");
    aegisSessionCookie = res.header["set-cookie"][0];
    aegisSessionSigCookie = res.header["set-cookie"][1];
  });

  describe("POST /api/v1/maestro/v2/doc/create", () => {
    test("Returns 401 when user has no permissions for the mission", async () => {
      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ missionId: testMissionIds[2] });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns 401 when user has view-only permissions for the mission", async () => {
      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
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
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ missionId: testMissionIds[0] });

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual(mockMaestroResponse);
    });

    test("Returns 500 when fetch throws an error", async () => {
      process.env.EMSS_TOKEN = "test-emss-token";

      (global.fetch as Mock).mockRejectedValueOnce(new Error("Network failure"));

      const res = await supertest(app)
        .post("/api/v1/maestro/v2/doc/create")
        .set("Cookie", [aegisSessionCookie, aegisSessionSigCookie])
        .send({ missionId: testMissionIds[0] });

      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toContain("Network failure");
    });
  });
});
