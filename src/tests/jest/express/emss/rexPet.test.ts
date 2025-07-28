import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { Mission_db, Rex_db } from "server/database/models/_allModels";
import MissionFactory from "../../factories/MissionFactory";
import RexFactory from "../../factories/RexFactory";
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

let testMissions: Mission_db[];
let testRexes: Rex_db[];

/**
 * Build a valid request body, overriding any fields as needed.
 * We only read testMissions after beforeAll has run.
 */
function makePetUpdateRequest(
  overrides: Partial<{
    rexUuid: string;
    petStartStopTimestamp: string;
    petValueAtStartStop: string;
    petRunning: boolean;
  }> = {}
) {
  return {
    rexUuid: "",
    petStartStopTimestamp: "2025-06-19T12:00:00Z",
    petValueAtStartStop: "00:05:30",
    petRunning: true,
    ...overrides,
  };
}

beforeAll(async () => {
  await getORM();
  const em = getEM();

  testMissions = await new MissionFactory(em).create(1);

  testRexes = await new RexFactory(em)
    .each((rex, idx) => {
      rex.mission = testMissions[0];
      rex.isRunning = idx === 0;
    })
    .create(2);
});

describe("REX PET API Endpoint", () => {
  const emssToken = process.env.EMSS_TOKEN || "test-emss-token";

  describe("POST request - Authentication", () => {
    test("Returns auth failure without emss-token", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
      });

      const res = await supertest(app).post("/api/v1/emss/rexPet").send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns auth failure with invalid emss-token", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", "invalid-token")
        .send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });
  });

  describe("POST request - Validation", () => {
    test("Returns validation error for missing rexUuid", async () => {
      const requestBody = makePetUpdateRequest();
      delete requestBody.rexUuid;

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });

    test("Returns validation error for missing petStartStopTimestamp", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
      });
      delete requestBody.petStartStopTimestamp;

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });

    test("Returns validation error for invalid petStartStopTimestamp format", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
        petStartStopTimestamp: "invalid-timestamp",
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Invalid petStartStopTimestamp format");
    });

    test("Returns validation error for missing petValueAtStartStop", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
      });
      delete requestBody.petValueAtStartStop;

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });

    test("Returns validation error for invalid petValueAtStartStop format", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
        petValueAtStartStop: "invalid-format",
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Invalid petValueAtStartStop format");
    });

    test("Returns validation error for missing petRunning", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
      });
      delete requestBody.petRunning;

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });
  });

  describe("POST request - Business Logic", () => {
    test("Returns error for non-existent rex", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: "non-existent-uuid",
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(404);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("not found");
    });

    test("Returns error for rex that is not running", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[1].uuid,
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("not running");
    });

    test("Successfully updates PET clock for running rex", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("Rex PET clock updated");
      expect(res.body.data).toBeDefined();
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.petStartStopTimestamp).toBe(requestBody.petStartStopTimestamp);
      expect(updatedRex?.petValueAtStartStop).toBe(requestBody.petValueAtStartStop);
      expect(updatedRex?.petRunning).toBe(requestBody.petRunning);
    });

    test("Successfully updates PET clock with petRunning false", async () => {
      const requestBody = makePetUpdateRequest({
        rexUuid: testRexes[0].uuid,
        petRunning: false,
        petValueAtStartStop: "00:10:45",
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexPet")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.petRunning).toBe(false);
      expect(updatedRex?.petValueAtStartStop).toBe("00:10:45");
    });
  });
});

afterAll(async () => {
  const em = getEM();
  for (const rex of testRexes) {
    await em.nativeDelete(Rex_db, { uuid: rex.uuid });
  }
  for (const mission of testMissions) {
    await em.nativeDelete(Mission_db, { id: mission.id });
  }
  await closeORM();
  jest.restoreAllMocks();
});
