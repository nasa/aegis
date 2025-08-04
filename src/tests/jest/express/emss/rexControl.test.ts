import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import { Mission_db, Rex_db } from "server/database/models/_allModels";
import MissionFactory from "../../factories/MissionFactory";
import RexFactory from "../../factories/RexFactory";
import * as SocketIo from "server/express/sockets";
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
function makeControlUpdateRequest(
  overrides: Partial<{
    rexUuid: string;
    maestroControlled?: boolean;
    startStopExecution?: "start" | "stop";
    maestroExecutionHash?: string;
  }> = {}
) {
  return {
    rexUuid: "",
    ...overrides,
  };
}

describe("REX Control API Endpoint", () => {
  const emssToken = process.env.EMSS_TOKEN || "test-emss-token";

  beforeAll(async () => {
    await getORM();
    const em = getEM();

    testMissions = await new MissionFactory(em).create(1);

    testRexes = await new RexFactory(em)
      .each((rex, idx) => {
        rex.mission = testMissions[0];
        rex.name = `Jest REX ${idx + 1}`;
      })
      .create(3);
  });

  describe("POST request - Authentication", () => {
    test("Returns auth failure without emss-token", async () => {
      const requestBody = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
      });

      const res = await supertest(app).post("/api/v1/emss/rexControl").send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns auth failure with invalid emss-token", async () => {
      const requestBody = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", "invalid-token")
        .send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });
  });

  describe("POST request - Validation", () => {
    test("Returns validation error for missing rexUuid", async () => {
      const requestBody = makeControlUpdateRequest({
        maestroControlled: true,
      });
      delete requestBody.rexUuid;

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameter");
    });

    test("Returns validation error when all optional parameters are missing", async () => {
      const requestBody = {
        rexUuid: testRexes[0].uuid,
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain(
        "At least one of maestroControlled, startStopExecution, or maestroExecutionHash must be provided"
      );
    });

    test("Returns validation error for invalid startStopExecution value", async () => {
      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
        startStopExecution: "invalid",
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("startStopExecution must be 'start' or 'stop'");
    });
  });

  describe("POST request - Business Logic", () => {
    test("Returns error for non-existent rex", async () => {
      const requestBody = makeControlUpdateRequest({
        rexUuid: "non-existent-uuid",
        maestroControlled: true,
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(404);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("not found");
    });

    test("Successfully updates rex control settings", async () => {
      const requestBody = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
        startStopExecution: "start",
        maestroExecutionHash: "updated-hash-67890",
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("Rex control settings updated");
      expect(res.body.data).toBeDefined();
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.maestroControlled).toBe(requestBody.maestroControlled);
      expect(updatedRex?.isRunning).toBe(true); // "start" sets to true
      expect(updatedRex?.maestroExecutionHash).toBe(requestBody.maestroExecutionHash);
    });

    test("Successfully updates maestroControlled", async () => {
      const requestBody = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
      });
      delete requestBody.startStopExecution;

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.maestroControlled).toBe(true);
    });

    test("Successfully updates execution hash", async () => {
      const em = getEM();

      // First, ensure we know the current state by resetting it
      testRexes[0].maestroControlled = false;
      testRexes[0].isRunning = false;
      testRexes[0].maestroExecutionHash = "";
      await em.persistAndFlush(testRexes[0]);

      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroExecutionHash: "hash-update-12345",
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);
      expect(res.body.data.maestroExecutionHash).toBe("hash-update-12345");

      const freshRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(freshRex.maestroExecutionHash).toBe("hash-update-12345");
    });

    test("Successfully updates execution state", async () => {
      const requestBody = {
        rexUuid: testRexes[1].uuid,
        startStopExecution: "start",
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[1].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[1].uuid });
      expect(updatedRex?.isRunning).toBe(true);
    });

    test("Successfully updates rex control settings with false values", async () => {
      const requestBody = makeControlUpdateRequest({
        rexUuid: testRexes[1].uuid,
        maestroControlled: false,
        startStopExecution: "stop",
        maestroExecutionHash: "disabled-hash-00000",
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[1].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[1].uuid });
      expect(updatedRex?.maestroControlled).toBe(false);
      expect(updatedRex?.isRunning).toBe(false); // "stop" sets to false
      expect(updatedRex?.maestroExecutionHash).toBe("disabled-hash-00000");
    });

    test("Successfully toggles execution state", async () => {
      // First, set rex to running
      const startRequestBody = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
        startStopExecution: "start",
        maestroExecutionHash: "start-hash-11111",
      });

      const startRes = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(startRequestBody);

      expect(startRes.statusCode).toBe(200);

      // Then, stop the execution
      const stopRequestBody = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
        startStopExecution: "stop",
        maestroExecutionHash: "stop-hash-22222",
      });

      const stopRes = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(stopRequestBody);

      expect(stopRes.statusCode).toBe(200);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.maestroControlled).toBe(true);
      expect(updatedRex?.isRunning).toBe(false); // "stop" sets to false
      expect(updatedRex?.maestroExecutionHash).toBe("stop-hash-22222");
    });

    test("Starting one rex stops all other running rexes", async () => {
      const em = getEM();

      // First, manually set testRexes[0] to running
      testRexes[0].isRunning = true;
      await em.persistAndFlush(testRexes[0]);

      // Verify testRexes[0] is running
      const rex0Before = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(rex0Before?.isRunning).toBe(true);

      // Now start testRexes[1] - this should stop testRexes[0]
      const startRequestBody = makeControlUpdateRequest({
        rexUuid: testRexes[1].uuid,
        startStopExecution: "start",
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(startRequestBody);

      expect(res.statusCode).toBe(200);

      // Refresh entities from database
      await em.refresh(testRexes[0]);
      await em.refresh(testRexes[1]);

      // Check that testRexes[1] is now running
      expect(testRexes[1].isRunning).toBe(true);

      // Check that testRexes[0] is no longer running
      expect(testRexes[0].isRunning).toBe(false);
    });

    test("Updates with empty hash are handled correctly", async () => {
      const em = getEM();

      // First set a hash
      const setHashRequest = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroExecutionHash: "initial-hash-123",
      });

      await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(setHashRequest);

      // Now clear it with empty string
      const clearHashRequest = {
        rexUuid: testRexes[0].uuid,
        maestroExecutionHash: "",
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(clearHashRequest);

      expect(res.statusCode).toBe(200);

      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.maestroExecutionHash).toBe("");
    });

    test("Socket emissions work correctly for different operation types", async () => {
      const emitStoreUpsertSpy = jest.spyOn(SocketIo, "emitStoreUpsert");

      // Test non-execution change (should emit single rex)
      const nonExecRequest = makeControlUpdateRequest({
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
      });
      delete nonExecRequest.startStopExecution;

      await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(nonExecRequest);

      expect(emitStoreUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          socketId: "maestroApi",
          type: "rex",
          data: expect.arrayContaining([expect.objectContaining({ uuid: testRexes[0].uuid })]),
        })
      );

      // Test execution start (should emit all mission rexes)
      const startExecRequest = makeControlUpdateRequest({
        rexUuid: testRexes[1].uuid,
        startStopExecution: "start",
      });

      await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(startExecRequest);

      // Should have been called with comprehensive mission data
      expect(emitStoreUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          socketId: "maestroApi",
          type: "rex",
          data: expect.arrayContaining([
            expect.objectContaining({ uuid: testRexes[0].uuid }),
            expect.objectContaining({ uuid: testRexes[1].uuid }),
          ]),
        })
      );
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
