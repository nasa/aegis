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

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

describe("REX Control API Endpoint", () => {
  describe("POST request - Authentication", () => {
    test("Returns auth failure without emss-token", async () => {
      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
      };

      const res = await supertest(app).post("/api/v1/emss/rexControl").send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns auth failure with invalid emss-token", async () => {
      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
      };

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
      const requestBody = {
        maestroControlled: true,
      };

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
        "At least one of maestroControlled, startStopExecution, maestroExecutionHash, or maestroActivityProperties must be provided"
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
      const requestBody = {
        rexUuid: "non-existent-uuid",
        maestroControlled: true,
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(404);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("not found");
    });

    test("Successfully updates rex control settings", async () => {
      const activityProperties: MaestroActivityProperties = {
        "activity-uuid-1": {
          color: "#ff0000",
          number: 1,
        },
        "activity-uuid-2": {
          color: "#00ff00",
          number: 2,
        },
      };

      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
        startStopExecution: "start",
        maestroExecutionHash: "updated-hash-67890",
        maestroActivityProperties: activityProperties,
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toContain("Rex control settings updated");
      expect(res.body.data).toBeDefined();
      expect(res.body.data[0].uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.maestroControlled).toBe(requestBody.maestroControlled);
      expect(updatedRex?.isRunning).toBe(true); // "start" sets to true
      expect(updatedRex?.maestroExecutionHash).toBe(requestBody.maestroExecutionHash);
      expect(updatedRex?.maestroActivityPropertiesByRefUuid).toEqual(activityProperties);
    });

    test("Successfully updates maestroControlled", async () => {
      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data[0].uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.maestroControlled).toBe(true);
    });

    test("Successfully updates execution hash", async () => {
      const em = getEM();

      // First, ensure we know the current state by resetting it
      const rexRecord = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      rexRecord.maestroControlled = false;
      rexRecord.isRunning = false;
      rexRecord.maestroExecutionHash = "";
      em.persistAndFlush(rexRecord);

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({
          rexUuid: rexRecord.uuid,
          maestroExecutionHash: "hash-update-12345",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data[0].uuid).toBe(testRexes[0].uuid);
      expect(res.body.data[0].maestroExecutionHash).toBe("hash-update-12345");

      em.clear(); // need to clear because Mikro-ORM caches entities
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
      expect(res.body.data[0].uuid).toBe(testRexes[1].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[1].uuid });
      expect(updatedRex?.isRunning).toBe(true);
    });

    test("Successfully updates rex control settings with false values", async () => {
      const requestBody = {
        rexUuid: testRexes[1].uuid,
        maestroControlled: false,
        startStopExecution: "stop",
        maestroExecutionHash: "disabled-hash-00000",
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data[0].uuid).toBe(testRexes[1].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[1].uuid });
      expect(updatedRex?.maestroControlled).toBe(false);
      expect(updatedRex?.isRunning).toBe(false); // "stop" sets to false
      expect(updatedRex?.maestroExecutionHash).toBe("disabled-hash-00000");
    });

    test("Starting one rex stops all other running rexes", async () => {
      const em = getEM();

      // First, manually set testRexes[0] to running
      const rexRecord = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      rexRecord.isRunning = true;
      await em.persistAndFlush(rexRecord);

      // Now start testRexes[1] - this should stop testRexes[0]
      const startRequestBody = {
        rexUuid: testRexes[1].uuid,
        startStopExecution: "start",
      };

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

    test("Successfully updates maestroActivityProperties", async () => {
      const em = getEM();

      // First, ensure we know the current state by resetting it
      const rexRecord = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      rexRecord.maestroControlled = false;
      rexRecord.isRunning = false;
      rexRecord.maestroActivityPropertiesByRefUuid = null;
      await em.persistAndFlush(rexRecord);

      const activityProperties: MaestroActivityPropertiesByRefUuid = {
        "activity-refuuid-test": {
          color: "#blue",
          number: 1,
        },
      };
      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroActivityProperties: activityProperties,
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data[0].uuid).toBe(testRexes[0].uuid);

      em.clear(); // need to clear because Mikro-ORM caches entities
      const freshRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(freshRex.maestroActivityPropertiesByRefUuid).toEqual(activityProperties);
    });

    test("Updates with empty hash are handled correctly", async () => {
      const em = getEM();

      // First set a hash
      const setHashRequest = {
        rexUuid: testRexes[0].uuid,
        maestroExecutionHash: "initial-hash-123",
      };

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

    test("Socket emit has multiple rexes in body", async () => {
      const emitStoreUpsertSpy = jest.spyOn(SocketIo, "emitStoreUpsert");

      // Stop all rexes first. Not sure what state they are in from previous tests
      // Doing a native update will directly execute a SQL query. no need to persist/flush
      const em = getEM();
      await em.nativeUpdate(
        Rex_db,
        { isRunning: true }, // Filter: only rexes where `isRunning` is true
        { isRunning: false } // Update: set `isRunning` to false
      );

      // Start a rex
      const nonExecRequest = {
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
        startStopExecution: "start",
      };

      await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(nonExecRequest);

      // Check that the array length is 1 (aka 1 rex was sent)
      const callArgs = emitStoreUpsertSpy.mock.calls[0][0]; // Get the first call's arguments
      expect(callArgs.data).toHaveLength(1);

      // Start a different rex. This should stop the first one
      const startExecRequest = {
        rexUuid: testRexes[1].uuid,
        startStopExecution: "start",
      };

      await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(startExecRequest);

      const callArgs2 = emitStoreUpsertSpy.mock.calls[1][0]; // Get the second call's arguments
      expect(callArgs2.data).toHaveLength(2);
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
