import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Doc_Listing_db } from "server/database/models/_allModels";
import DocListingFactory from "../../fixtures/entityFactories/DocListingFactory";
import supertest from "supertest";
import app from "server/express/restApi";
import { createMockAutomergeRepo } from "../../helpers/mockAutomergeRepo";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import type { AutomergeUrl } from "@automerge/automerge-repo";

// suppress socketio side-effects (no real socket server in tests).
// Note: avoid vi.importActual here — it would trigger loading the real
// sockets.ts which transitively loads sockets-maestro.ts → rexOverwrite.ts →
// sockets.ts (circular), causing rexOverwrite.ts to capture the real
// emitStoreUpsert instead of the mock.
vi.mock("server/express/sockets", () => ({
  emitStoreUpsert: vi.fn(),
  emitStoreDelete: vi.fn(),
}));

let testAutomergeDocListings: Doc_Listing_db[];
let testMissionsPartial: Partial<Mission>[];
let testRexes: Rex[];
let testEva: Eva;
let testStation: Station;
let testTraverse: Traverse;
let testStationAction: Action;
let validRexOverwrite: RexOverwrite;
const emssToken = process.env.EMSS_TOKEN;

const getMissionDoc = async (): Promise<Mission> => {
  const handle = await globalValues.automergeRepo.find(
    testAutomergeDocListings[0].automergeUrl as AutomergeUrl
  );
  return handle.doc() as unknown as Mission;
};

/** Reset rexes to a known state between tests */
const resetRexes = async (): Promise<void> => {
  const handle = await globalValues.automergeRepo.find(
    testAutomergeDocListings[0].automergeUrl as AutomergeUrl
  );
  handle.change((m: Mission) => {
    for (let i = 0; i < testRexes.length; i++) {
      const r = m.rexes[testRexes[i].uuid];
      if (!r) continue;
      r.isRunning = i === 1; // index 1 starts running, 0 starts stopped
      r.maestroControlled = false;
      r.maestroEventId = "";
      r.maestroEventUrl = "";
      r.posEntries = [];
      r.maestroActivityPropertiesByRefUuid = null;
    }
  });
};

beforeAll(async () => {
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();

  testAutomergeDocListings = await new DocListingFactory(em)
    .each((record) => {
      record.automergeUrl = `automerge:VitestTestMissionRexOverwrite`;
    })
    .create(1);

  testStation = generateBlankStation({ name: "Vitest RexOverwrite Station" });
  testTraverse = generateBlankTraverse({ name: "Vitest RexOverwrite Traverse" });
  testStationAction = generateBlankAction({
    name: "Vitest RexOverwrite Station Action",
    stationUuid: testStation.uuid,
  });
  testEva = generateBlankEVA({
    name: "Vitest RexOverwrite Eva",
    sequence: [
      { type: "traverse", uuid: testTraverse.uuid },
      { type: "station", uuid: testStation.uuid },
    ],
  });
  testRexes = [
    generateBlankRex({ name: "Vitest Rex rexOverwrite 1", evaUuid: testEva.uuid }),
    generateBlankRex({ name: "Vitest Rex rexOverwrite 2", evaUuid: testEva.uuid }),
  ];
  testRexes[1].isRunning = true;

  testMissionsPartial = [
    {
      id: testAutomergeDocListings[0].missionId,
      name: "Vitest Test Mission RexOverwrite",
      isArchived: false,
      stations: { [testStation.uuid]: testStation },
      traverses: { [testTraverse.uuid]: testTraverse },
      actions: { [testStationAction.uuid]: testStationAction },
      evas: { [testEva.uuid]: testEva },
      rexes: {
        [testRexes[0].uuid]: testRexes[0],
        [testRexes[1].uuid]: testRexes[1],
      },
    },
  ];

  globalValues.automergeRepo = createMockAutomergeRepo(testMissionsPartial);

  // build a known-valid RexOverwrite payload
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
      egress: { color: "#ff0000", number: "1" },
      [testStation.refUuid]: { color: "#00ffff", number: "2A" },
      [testTraverse.refUuid]: { color: "#0000ff", number: "3" },
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
      [testStationAction.refUuid]: { rexStatus: "complete", markerId: "marker-123" },
    },
    xgressEntries: {
      egress: { rexStatus: "complete" },
      ingress: { rexStatus: "in-progress" },
    },
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  await resetRexes();
});

describe("REX Status API Endpoint", () => {
  describe("POST request - Authentication", () => {
    test("Returns auth failure without emss-token", async () => {
      const response = await supertest(app).post("/api/v1/emss/rexOverwrite").send({});
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ status: "failure", message: "Unauthorized" });
    });

    test("Returns auth failure with invalid emss-token", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", "invalid_token")
        .send({});
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ status: "failure", message: "Unauthorized" });
    });
  });

  describe("POST request - Validation", () => {
    test("Fails schema validation with invalid payload", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({ invalidField: "value" });
      expect(response.status).toBe(400);
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
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            maestroActivityPropertiesByRefUuid: { egress: { color: "green", number: 1 } },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("maestroActivityPropertiesByRefUuid");
      });

      test("Fails if number length is greater than 3", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            maestroActivityPropertiesByRefUuid: {
              egress: { color: "#ffffff", number: "1011" },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid number property");
      });
    });

    describe("stationEntriesByRefUuid validation", () => {
      test("Fails if invalid station refUuid", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            stationEntriesByRefUuid: { "invalid-uuid": { rexStatus: "complete" } },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid stationRefUuid");
      });

      test("Fails if percent complete is out of range", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            stationEntriesByRefUuid: {
              [testStation.refUuid]: { rexStatus: "complete", maestroPercentCompleteEv1: 150 },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Entry must have a valid maestroPercentCompleteEv1 property between 0 and 100."
        );
      });
    });

    describe("traverseEntriesByRefUuid validation", () => {
      test("Fails if invalid traverse refUuid", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            traverseEntriesByRefUuid: { "invalid-uuid": { rexStatus: "complete" } },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid traverseRefUuid");
      });

      test("Fails if percent complete is negative", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            traverseEntriesByRefUuid: {
              [testTraverse.refUuid]: { rexStatus: "complete", maestroPercentCompleteEv2: -10 },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Entry must have a valid maestroPercentCompleteEv2 property between 0 and 100."
        );
      });
    });

    describe("actionEntriesByRefUuid mass validation", () => {
      test("Fails if mass = 1 (mass should not be provided)", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            actionEntriesByRefUuid: {
              [testStationAction.refUuid]: { rexStatus: "complete", mass: 1 },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Action entry mass property should not be provided."
        );
      });

      test("Fails if mass = 0", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            actionEntriesByRefUuid: {
              [testStationAction.refUuid]: { rexStatus: "complete", mass: 0 },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "Action entry mass property should not be provided."
        );
      });

      test("Fails if mass is null", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            actionEntriesByRefUuid: {
              [testStationAction.refUuid]: { rexStatus: "complete", mass: null },
            } as ActionEntries,
          });
        expect(response.status).toBe(400);
      });

      test("Fails if containerId > 20 characters", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            actionEntriesByRefUuid: {
              [testStationAction.refUuid]: {
                rexStatus: "complete",
                containerId: "a".repeat(21),
              },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("containerId must be less than 20 characters.");
      });

      test("Fails if secondaryContainerId > 20 characters", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            actionEntriesByRefUuid: {
              [testStationAction.refUuid]: {
                rexStatus: "complete",
                secondaryContainerId: "a".repeat(21),
              },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain(
          "secondaryContainerId must be less than 20 characters."
        );
      });

      test("Fails if markerId > 20 characters", async () => {
        const response = await supertest(app)
          .post("/api/v1/emss/rexOverwrite")
          .set("emss-token", emssToken)
          .send({
            ...validRexOverwrite,
            actionEntriesByRefUuid: {
              [testStationAction.refUuid]: {
                rexStatus: "complete",
                markerId: "a".repeat(21),
              },
            },
          });
        expect(response.status).toBe(400);
        expect(response.body.message).toContain("markerId must be less than 20 characters.");
      });
    });

    test("Fails if xgressEntries contains invalid typeRefUuid", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send({
          ...validRexOverwrite,
          xgressEntries: { invalidType: { rexStatus: "complete" } },
        });
      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        "Invalid typeRefUuid: invalidType for xgress. Must be 'egress' or 'ingress'."
      );
    });
  });

  describe("POST request - Business Logic", () => {
    test("Successfully overwrites a REX, stops the previously-running one, emits both", async () => {
      const response = await supertest(app)
        .post("/api/v1/emss/rexOverwrite")
        .set("emss-token", emssToken)
        .send(validRexOverwrite);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.message).toContain("Rex updated for rex uuids");

      // Two rexes returned: the one we updated + the previously running one we stopped
      expect(response.body.data.length).toBe(2);

      // Verify on the Automerge doc
      const mission = await getMissionDoc();
      const updatedRex = mission.rexes[testRexes[0].uuid];
      expect(updatedRex).toBeDefined();
      expect(updatedRex.isRunning).toBe(true);
      // Starting a rex creates initial pos entries (one per source, each
      // containing all pos types). Default rex has 3 sources + 3 types.
      expect(updatedRex.posEntries.length).toBe(3);
      expect(updatedRex.posEntries[0].posTypeUuids.length).toBe(3);

      // Previously running rex was stopped
      expect(mission.rexes[testRexes[1].uuid].isRunning).toBe(false);
    });
  });
});

afterAll(async () => {
  const em = globalValues.orm.em.fork();
  for (let i = 0; i < testAutomergeDocListings.length; i++) {
    await em.nativeDelete(Doc_Listing_db, { missionId: testAutomergeDocListings[i].missionId });
  }
  await globalValues.orm.close();
  globalValues.orm = null;
  vi.restoreAllMocks();
});
