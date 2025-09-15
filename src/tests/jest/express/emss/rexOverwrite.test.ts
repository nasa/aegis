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

let testMission: Mission_db;
let testRexes: Rex_db[];
let testEva: Eva_db;
let testStation: Station_db;
let testTraverse: Traverse_db;
let testStationAction: Action_db;
const emssToken = process.env.EMSS_TOKEN;
let validRexOverwrite: RexOverwrite;

beforeAll(async () => {
  await getORM();
  const em = getEM();

  testMission = await new MissionFactory(em).createOne();
  testStation = await new StationFactory(em)
    .each((station) => {
      station.mission = testMission;
    })
    .createOne();
  testTraverse = await new TraverseFactory(em)
    .each((traverse) => {
      traverse.mission = testMission;
    })
    .createOne();
  testStationAction = await new ActionFactory(em)
    .each((action) => {
      action.mission = testMission;
      action.station = testStation;
    })
    .createOne();
  testEva = await new EvaFactory(em)
    .each((eva) => {
      eva.mission = testMission;
      eva.sequence = [
        { type: "traverse", uuid: testTraverse.uuid },
        { type: "station", uuid: testStation.uuid },
      ];
    })
    .createOne();
  testRexes = await new RexFactory(em)
    .each((rex, idx) => {
      rex.name = `Jest Rex rexOverwrite ${idx + 1}`;
      rex.mission = testMission;
      rex.evaUuid = testEva.uuid;
      rex.isRunning = idx === 1; // create one rex that is running, one that is not
    })
    .create(2);

  // populate a valid rexOverwrite object for use in tests
  validRexOverwrite = {
    uuid: testRexes[0].uuid,
    petStartStopTimestamp: "2025-09-04T01:00:00Z",
    petValueAtStartStop: "00:05:30",
    petRunning: true,
    maestroControlled: true,
    isRunning: true,
    maestroEventId: "111-222-333-444-555-666",
    maestroEventUrl: "https://maestro-server.example.com/events/111-222-333-444-555-666",
    maestroActivityPropertiesByRefUuid: {
      egress: {
        color: "#ff0000",
        number: 1,
      },
      [testStation.refUuid]: {
        color: "#00ffff",
        number: 2,
      },
      [testTraverse.refUuid]: {
        color: "#0000ff",
        number: 3,
      },
    },
    stationEntriesByRefUuid: {
      [testStation.refUuid]: {
        rexStatus: "complete",
        maestroPercentCompleteEv1: 0,
        maestroPercentCompleteEv2: 100,
      },
    },
    traverseEntriesByRefUuid: {
      [testTraverse.refUuid]: {
        rexStatus: "in-progress",
        maestroPercentCompleteEv1: 20,
        maestroPercentCompleteEv2: 80,
      },
    },
    actionEntriesByRefUuid: {
      [testStationAction.refUuid]: {
        rexStatus: "complete",
        mass: 1,
        markerId: "marker-123",
      },
    },
    xgressEntries: {
      egress: {
        rexStatus: "complete",
      },
      ingress: {
        rexStatus: "in-progress",
      },
    },
  };
});

beforeEach(async () => {
  jest.clearAllMocks(); // clear call count
});

describe("REX Status API Endpoint", () => {
  describe("POST request - Authentication", () => {
    test("Returns auth failure without emss-token", async () => {
      const response = await supertest(app).post("/api/v1/emss/rexOverwrite").send({});
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        status: "failure",
        message: "Unauthorized",
      });
    });

    test("Returns auth failure with invalid emss-token", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", "invalid_token")
        .send({});
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        status: "failure",
        message: "Unauthorized",
      });
    });
  });

  describe("POST request - Validation", () => {
    test("Fails schema validation with invalid payload", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({ invalidField: "value" });
      expect(response.status).toBe(400);
      expect(response.body.status).toBe("failure");
      expect(response.body.message).toContain("RexOverwrite object failed schema validation");
    });

    test("Fails if rexUuid is not a valid UUID", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({ ...validRexOverwrite, uuid: "invalid-uuid" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("rexUuid must be a valid UUID.");
    });

    test("Fails if petRunning is true but isRunning is false", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({ ...validRexOverwrite, petRunning: true, isRunning: false });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "Rex must be running (isRunning=true) in order to set petRunning=true."
      );
    });

    test("Fails if petValueAtStartStop is not in HHMMSS format", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({ ...validRexOverwrite, petValueAtStartStop: "invalid" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("PetValueAtStartStop must be HHMMSS format.");
    });

    test("Fails if petStartStopTimestamp is not an ISO string", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({ ...validRexOverwrite, petStartStopTimestamp: "invalid" });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("petStartStopTimestamp must be an ISO String format.");
    });

    test("Fails if maestroEventUrl is not a valid URL", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({ ...validRexOverwrite, maestroEventUrl: "invalid-url" });
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("MaestroEventURL be a valid URL");
    });

    describe("maestroActivityPropertiesByRefUuid validation", () => {
      test("Fails if invalid color", async () => {
        const payload = {
          ...validRexOverwrite,
          maestroActivityPropertiesByRefUuid: {
            egress: { color: "green", number: 1 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid color format");
      });

      test("Fails if number contains decimal", async () => {
        const payload = {
          ...validRexOverwrite,
          maestroActivityPropertiesByRefUuid: {
            egress: { color: "#ffffff", number: 1.5 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid number property");
      });

      test("Fails if number is less than 0", async () => {
        const payload = {
          ...validRexOverwrite,
          maestroActivityPropertiesByRefUuid: {
            egress: { color: "#ffffff", number: -1 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid number property");
      });

      test("Fails if number is greater than 99", async () => {
        const payload = {
          ...validRexOverwrite,
          maestroActivityPropertiesByRefUuid: {
            egress: { color: "#ffffff", number: 101 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid number property");
      });
    });

    describe("stationEntriesByRefUuid validation", () => {
      test("Fails if invalid station refUuid", async () => {
        const payload = {
          ...validRexOverwrite,
          stationEntriesByRefUuid: { "invalid-uuid": { rexStatus: "complete" } },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid stationRefUuid");
      });

      test("Fails if stationEntriesByRefUuid contains invalid percent complete", async () => {
        const payload = {
          ...validRexOverwrite,
          stationEntriesByRefUuid: {
            [testStation.refUuid]: { rexStatus: "complete", maestroPercentCompleteEv1: 150 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Entry must have a valid maestroPercentCompleteEv1 property between 0 and 100."
        );
      });
    });

    describe("traverseEntriesByRefUuid validation", () => {
      test("Fails if invalid traverse refUuid", async () => {
        const payload = {
          ...validRexOverwrite,
          traverseEntriesByRefUuid: { "invalid-uuid": { rexStatus: "complete" } },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid traverseRefUuid");
      });

      test("Fails if traverseEntriesByRefUuid contains invalid percent complete", async () => {
        const payload = {
          ...validRexOverwrite,
          traverseEntriesByRefUuid: {
            [testTraverse.refUuid]: { rexStatus: "complete", maestroPercentCompleteEv2: -10 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Entry must have a valid maestroPercentCompleteEv2 property between 0 and 100."
        );
      });
    });

    describe("actionEntriesByRefUuid mass validation", () => {
      test("Fails if actionEntriesByRefUuid contains mass > 9999", async () => {
        const payload = {
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: { rexStatus: "complete", mass: 10000 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Action entry must have a valid mass property");
      });

      test("Fails if actionEntriesByRefUuid contains mass = 0", async () => {
        const payload = {
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: { rexStatus: "complete", mass: 0 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Action entry must have a valid mass property");
      });

      test("Fails if actionEntriesByRefUuid contains mass < 0", async () => {
        const payload = {
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: { rexStatus: "complete", mass: -10 },
          },
        };
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send(payload);
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Action entry must have a valid mass property");
      });
    });

    test("Fails if xgressEntries contains invalid typeRefUuid", async () => {
      const payload = {
        ...validRexOverwrite,
        xgressEntries: { invalidType: { rexStatus: "complete" } },
      };
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send(payload);
      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        "Invalid typeRefUuid: invalidType for xgress. Must be 'egress' or 'ingress'."
      );
    });
  });

  describe("POST request - Business Logic", () => {
    test("Successfully updates REX with valid payload", async () => {
      const emitStoreUpsertSpy = jest.spyOn(SocketIo, "emitStoreUpsert");

      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send(validRexOverwrite);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("Rex updated for rex uuids");

      // Check that the array length is 2 (aka 2 rexes were sent because one was stopped)
      expect(response.body.data.length).toBe(2);
      const callArgs = emitStoreUpsertSpy.mock.calls[0][0]; // Get the first call's arguments
      expect(callArgs.data).toHaveLength(2);
    });
  });
});

afterAll(async () => {
  const em = getEM();
  for (const rex of testRexes) {
    await em.nativeDelete(Rex_db, { uuid: rex.uuid });
  }
  await em.nativeDelete(Action_db, { uuid: testStationAction.uuid });
  await em.nativeDelete(Station_db, { uuid: testStation.uuid });
  await em.nativeDelete(Traverse_db, { uuid: testTraverse.uuid });
  await em.nativeDelete(Eva_db, { uuid: testEva.uuid });
  await em.nativeDelete(Mission_db, { id: testMission.id });

  await closeORM();
  jest.restoreAllMocks();
});
