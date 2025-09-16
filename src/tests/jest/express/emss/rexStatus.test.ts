import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { getORM, getEM, closeORM } from "utils/mikro";
import {
  Mission_db,
  Rex_db,
  Eva_db,
  Station_db,
  Traverse_db,
  Action_db,
} from "server/database/models/_allModels";
import MissionFactory from "../../factories/MissionFactory";
import RexFactory from "../../factories/RexFactory";
import EvaFactory from "tests/jest/factories/EVAFactory";
import StationFactory from "tests/jest/factories/StationFactory";
import TraverseFactory from "tests/jest/factories/TraverseFactory";
import ActionFactory from "tests/jest/factories/ActionFactory";
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
let testRex2: Rex_db;
let testEva: Eva_db;
let testEva2: Eva_db;
let testStation: Station_db;
let testTraverse: Traverse_db;
let testAction: Action_db;
const emssToken = process.env.EMSS_TOKEN;

/**
 * Build a valid request body, overriding any fields as needed.
 * We only read testMissions after beforeAll has run.
 */
function makeStatusUpdateRequest(
  overrides: Partial<{
    rexUuid: string;
    type: string;
    typeRefUuid: string;
    entry: ActivityEntry | ActionEntry;
  }> = {}
) {
  return {
    rexUuid: "jest-rex-uuid",
    type: "station",
    typeRefUuid: "jest-station-ref-uuid",
    entry: { rexStatus: "pending" },
    ...overrides,
  };
}

beforeAll(async () => {
  await getORM();
  const em = getEM();

  testMissions = await new MissionFactory(em).create(2);
  testStation = await new StationFactory(em)
    .each((station) => {
      station.mission = testMissions[0];
    })
    .createOne();
  testTraverse = await new TraverseFactory(em)
    .each((traverse) => {
      traverse.mission = testMissions[0];
    })
    .createOne();
  testAction = await new ActionFactory(em)
    .each((action) => {
      action.mission = testMissions[0];
      action.station = testStation;
    })
    .createOne();
  testEva = await new EvaFactory(em)
    .each((eva) => {
      eva.mission = testMissions[0];
      eva.sequence = [
        { type: "traverse", uuid: testTraverse.uuid },
        { type: "station", uuid: testStation.uuid },
      ];
    })
    .createOne();
  testRexes = await new RexFactory(em)
    .each((rex, idx) => {
      rex.name = `Jest Rex ${idx + 1}`;
      rex.mission = testMissions[0];
      rex.evaUuid = testEva.uuid;
      rex.isRunning = idx === 0; // create one rex that is running, one that is not
    })
    .create(2);

  testEva2 = await new EvaFactory(em)
    .each((eva) => {
      eva.mission = testMissions[1];
    })
    .createOne();
  testRex2 = await new RexFactory(em).createOne({
    mission: testMissions[1],
    name: `Jest REX 1`,
    isRunning: true,
    evaUuid: testEva2.uuid,
  });
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

describe("REX Status API Endpoint", () => {
  describe("POST request - Authentication", () => {
    test("Returns auth failure without emss-token", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
        }),
      ];

      const res = await supertest(app).post("/api/v1/emss/rexStatus").send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns auth failure with invalid emss-token", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", "some-invalid-token")
        .send(requestBody);

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });
  });

  describe("POST request - Validation", () => {
    test("Returns validation error if request body is not an array", async () => {
      const requestBody = makeStatusUpdateRequest();

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Request body must be an array");
    });

    test("Returns validation error if one of the array items is invalid", async () => {
      const requestBody = [
        makeStatusUpdateRequest({ rexUuid: testRexes[0].uuid }),
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "some-invalid-type",
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Invalid type");
    });

    test("Returns validation error for missing property 'rexUuid'", async () => {
      const requestBody = [makeStatusUpdateRequest()];
      delete requestBody[0].rexUuid;

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });

    test("Returns error for rex that is not running", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[1].uuid,
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toContain("not running");
    });

    test("Returns validation error for inconsistent rexUuids", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
        }),
        makeStatusUpdateRequest({
          rexUuid: testRexes[1].uuid,
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("All entries must have the same rexUuid");
    });

    test("Returns validation error for missing property 'type'", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
        }),
      ];
      delete requestBody[0].type;

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });

    test("Returns validation error for invalid 'type' value", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "some-invalid-type",
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Invalid type");
    });

    test("Returns validation error for missing property 'typeRefUuid'", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
        }),
      ];
      delete requestBody[0].typeRefUuid;

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });

    test("Returns validation error for missing property 'entry'", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
        }),
      ];
      delete requestBody[0].entry;

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Missing required body parameters");
    });

    test("Returns validation error for invalid 'rexStatus' in 'entry'", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          entry: { rexStatus: "some-invalid-value" } as any,
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("must have a valid rexStatus");
    });

    test("Returns validation error for invalid typeRefUuid when type is 'xgress'", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "xgress",
          typeRefUuid: "some-invalid-xgress-type",
          entry: { rexStatus: "pending" },
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toContain("Invalid typeRefUuid");
      expect(res.body.message).toContain("Must be 'egress' or 'ingress'");
    });

    describe("POST request - Percent Complete validation", () => {
      test("Returns validation error for invalid EV1 completion percentage", async () => {
        const requestBody = [
          makeStatusUpdateRequest({
            rexUuid: testRexes[0].uuid,
            type: "xgress",
            typeRefUuid: "egress",
            entry: {
              rexStatus: "in-progress",
              maestroPercentCompleteEv1: -50,
            },
          }),
        ];
        const res = await supertest(app)
          .post("/api/v1/emss/rexStatus")
          .set("emss-token", emssToken)
          .send(requestBody);
        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe("failure");
        expect(res.body.message).toContain("between 0 and 100");
      });
      test("Returns validation error for invalid ev2 completion percentage", async () => {
        const requestBody = [
          makeStatusUpdateRequest({
            rexUuid: testRexes[0].uuid,
            type: "xgress",
            typeRefUuid: "egress",
            entry: {
              rexStatus: "in-progress",
              maestroPercentCompleteEv2: "some-invalid-string",
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }),
        ];
        const res = await supertest(app)
          .post("/api/v1/emss/rexStatus")
          .set("emss-token", emssToken)
          .send(requestBody);
        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe("failure");
        expect(res.body.message).toContain("between 0 and 100");
      });
    });

    describe("POST request - Action entry validation", () => {
      test("Returns error for mass too long", async () => {
        const requestBody = [
          makeStatusUpdateRequest({
            rexUuid: testRexes[0].uuid,
            type: "action",
            typeRefUuid: testAction.refUuid,
            entry: {
              rexStatus: "complete",
              mass: 123456,
              markerId: "marker-123",
              containerId: "container-456",
              secondaryContainerId: "secondary-789",
            },
          }),
        ];

        const res = await supertest(app)
          .post("/api/v1/emss/rexStatus")
          .set("emss-token", emssToken)
          .send(requestBody);

        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe("failure");
        expect(res.body.message).toContain("must have a valid mass property");
      });
      test("Returns error for mass not being an integer", async () => {
        const requestBody = [
          makeStatusUpdateRequest({
            rexUuid: testRexes[0].uuid,
            type: "action",
            typeRefUuid: testAction.refUuid,
            entry: {
              rexStatus: "complete",
              mass: 12.4,
              markerId: "marker-123",
              containerId: "container-456",
              secondaryContainerId: "secondary-789",
            },
          }),
        ];

        const res = await supertest(app)
          .post("/api/v1/emss/rexStatus")
          .set("emss-token", emssToken)
          .send(requestBody);

        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe("failure");
        expect(res.body.message).toContain("must have a valid mass property");
      });
      test("Returns error for containerId too long", async () => {
        const requestBody = [
          makeStatusUpdateRequest({
            rexUuid: testRexes[0].uuid,
            type: "action",
            typeRefUuid: testAction.refUuid,
            entry: {
              rexStatus: "complete",
              containerId: "container-id-that-is-way-too-long",
            },
          }),
        ];

        const res = await supertest(app)
          .post("/api/v1/emss/rexStatus")
          .set("emss-token", emssToken)
          .send(requestBody);

        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe("failure");
        expect(res.body.message).toContain("containerId must be less than 20 characters");
      });
      test("Returns error for secondaryContainerId too long", async () => {
        const requestBody = [
          makeStatusUpdateRequest({
            rexUuid: testRexes[0].uuid,
            type: "action",
            typeRefUuid: testAction.refUuid,
            entry: {
              rexStatus: "complete",
              secondaryContainerId: "secondary-container-id-that-is-way-too-long",
            },
          }),
        ];

        const res = await supertest(app)
          .post("/api/v1/emss/rexStatus")
          .set("emss-token", emssToken)
          .send(requestBody);

        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe("failure");
        expect(res.body.message).toContain("secondaryContainerId must be less than 20 characters");
      });
      test("Returns error for markerId too long", async () => {
        const requestBody = [
          makeStatusUpdateRequest({
            rexUuid: testRexes[0].uuid,
            type: "action",
            typeRefUuid: testAction.refUuid,
            entry: {
              rexStatus: "complete",
              markerId: "marker-id-that-is-way-too-long",
            },
          }),
        ];

        const res = await supertest(app)
          .post("/api/v1/emss/rexStatus")
          .set("emss-token", emssToken)
          .send(requestBody);

        expect(res.statusCode).toBe(400);
        expect(res.body.status).toBe("failure");
        expect(res.body.message).toContain("markerId must be less than 20 characters");
      });
    });
  });

  describe("POST request - Business Logic", () => {
    test("Returns error for non-existent rex", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: "some-non-existent-uuid",
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(500);
      expect(res.body.status).toBe("error");
      expect(res.body.message).toContain("not found");
    });

    test("Successfully updates station entry for running rex", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "station",
          typeRefUuid: testStation.refUuid,
          entry: { rexStatus: "in-progress" },
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.stationEntries[testStation.uuid]).toEqual({ rexStatus: "in-progress" });
    });

    test("Successfully updates traverse entry for running rex", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "traverse",
          typeRefUuid: testTraverse.refUuid,
          entry: { rexStatus: "complete" },
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.traverseEntries[testTraverse.uuid]).toEqual({ rexStatus: "complete" });
    });

    test("Successfully updates action entry for running rex", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "action",
          typeRefUuid: testAction.refUuid,
          entry: {
            rexStatus: "skipped",
            mass: 100,
            markerId: "marker-123",
            containerId: "container-456",
            secondaryContainerId: "secondary-789",
          },
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.actionEntries[testAction.uuid]).toEqual({
        rexStatus: "skipped",
        mass: 100,
        markerId: "marker-123",
        containerId: "container-456",
        secondaryContainerId: "secondary-789",
      });
    });

    test("Successfully updates egress entry for running rex", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "xgress",
          typeRefUuid: "egress",
          entry: { rexStatus: "in-progress" },
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.xgressEntries["egress"]).toEqual({ rexStatus: "in-progress" });
    });

    test("Successfully updates ingress entry for running rex", async () => {
      const requestBody = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "xgress",
          typeRefUuid: "ingress",
          entry: { rexStatus: "complete" },
        }),
      ];

      const res = await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.uuid).toBe(testRexes[0].uuid);

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.xgressEntries["ingress"]).toEqual({ rexStatus: "complete" });
    });

    test("Combines multiple updates for the same rex", async () => {
      const emitStoreUpsertSpy = jest.spyOn(SocketIo, "emitStoreUpsert");
      const combinedUpdate = [
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "xgress",
          typeRefUuid: "ingress",
          entry: { rexStatus: "in-progress" },
        }),
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "traverse",
          typeRefUuid: testTraverse.refUuid,
          entry: {
            rexStatus: "skipped",
            maestroPercentCompleteEv1: 50,
            maestroPercentCompleteEv2: 50,
          },
        }),
        makeStatusUpdateRequest({
          rexUuid: testRexes[0].uuid,
          type: "traverse",
          typeRefUuid: testTraverse.refUuid,
          entry: {
            rexStatus: "complete",
            maestroPercentCompleteEv1: 100,
            maestroPercentCompleteEv2: 100,
          },
        }),
      ];

      await supertest(app)
        .post("/api/v1/emss/rexStatus")
        .set("emss-token", emssToken)
        .send(combinedUpdate);

      // only one emit should be called for the same rex
      expect(emitStoreUpsertSpy).toHaveBeenCalledTimes(1);
      expect(emitStoreUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          missionId: testRexes[0].mission.id,
          socketId: "maestroApi",
          type: "rex",
          data: expect.arrayContaining([expect.objectContaining({ uuid: testRexes[0].uuid })]),
        })
      );

      const em = getEM();
      const updatedRex = await em.findOne(Rex_db, { uuid: testRexes[0].uuid });
      expect(updatedRex?.traverseEntries[testTraverse.uuid].rexStatus).toBe("complete");
      expect(updatedRex?.traverseEntries[testTraverse.uuid].maestroPercentCompleteEv1).toBe(100);
      expect(updatedRex?.traverseEntries[testTraverse.uuid].maestroPercentCompleteEv2).toBe(100);
      expect(updatedRex?.xgressEntries["ingress"].rexStatus).toBe("in-progress");
    });
  });
});

afterAll(async () => {
  const em = getEM();
  for (const rex of testRexes) {
    await em.nativeDelete(Rex_db, { uuid: rex.uuid });
  }
  await em.nativeDelete(Rex_db, { uuid: testRex2.uuid });
  await em.nativeDelete(Action_db, { uuid: testAction.uuid });
  await em.nativeDelete(Station_db, { uuid: testStation.uuid });
  await em.nativeDelete(Traverse_db, { uuid: testTraverse.uuid });
  await em.nativeDelete(Eva_db, { uuid: testEva.uuid });
  await em.nativeDelete(Eva_db, { uuid: testEva2.uuid });
  for (const mission of testMissions) {
    await em.nativeDelete(Mission_db, { id: mission.id });
  }
  await closeORM();
  jest.restoreAllMocks();
});
