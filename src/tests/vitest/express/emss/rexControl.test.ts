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
import type { AutomergeUrl } from "@automerge/automerge-repo";

// suppress socketio side-effects (no real socket server in tests)
vi.mock("server/express/sockets", async () => {
  const actual = await vi.importActual("server/express/sockets");
  return {
    ...(actual as object),
    emitStoreUpsert: vi.fn(),
    emitStoreDelete: vi.fn(),
  };
});

let testAutomergeDocListings: Doc_Listing_db[];
let testMissionsPartial: Partial<Mission>[];
let testEva: Eva;
let testRexes: Rex[];
const emssToken = process.env.EMSS_TOKEN;

/** Pull the current mission doc back out of the mock automerge repo */
const getMissionDoc = async (): Promise<Mission> => {
  const handle = await globalValues.automergeRepo.find(
    testAutomergeDocListings[0].automergeUrl as AutomergeUrl
  );
  return handle.doc() as unknown as Mission;
};

/** Reset rexes back to a clean state between tests */
const resetRexes = async (): Promise<void> => {
  const handle = await globalValues.automergeRepo.find(
    testAutomergeDocListings[0].automergeUrl as AutomergeUrl
  );
  handle.change((m: Mission) => {
    for (const rex of testRexes) {
      const r = m.rexes[rex.uuid];
      if (!r) continue;
      r.isRunning = false;
      r.maestroControlled = false;
      r.maestroEventId = "";
      r.maestroActivityPropertiesByRefUuid = null;
      r.posEntries = [];
    }
  });
};

beforeAll(async () => {
  // Initialize MikroORM
  globalValues.orm = await MikroORM.init(config);
  const em = globalValues.orm.em.fork();

  testAutomergeDocListings = await new DocListingFactory(em)
    .each((record) => {
      record.automergeUrl = `automerge:VitestTestMissionRexControl`;
    })
    .create(1);

  testEva = generateBlankEVA({ name: "Vitest Eva For RexControl" });
  testRexes = [
    generateBlankRex({ name: "Vitest REX 1", evaUuid: testEva.uuid }),
    generateBlankRex({ name: "Vitest REX 2", evaUuid: testEva.uuid }),
    generateBlankRex({ name: "Vitest REX 3", evaUuid: testEva.uuid }),
  ];

  const evasRecord: Record<string, Eva> = { [testEva.uuid]: testEva };
  const rexesRecord: Record<string, Rex> = {};
  for (const r of testRexes) rexesRecord[r.uuid] = r;

  testMissionsPartial = [
    {
      id: testAutomergeDocListings[0].missionId,
      name: "Vitest Test Mission RexControl",
      isArchived: false,
      evas: evasRecord,
      rexes: rexesRecord,
    },
  ];

  globalValues.automergeRepo = createMockAutomergeRepo(testMissionsPartial);
});

beforeEach(async () => {
  vi.clearAllMocks();
  await resetRexes();
});

describe("REX Control API Endpoint", () => {
  describe("POST request - Authentication", () => {
    test("Returns auth failure without emss-token", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .send({ rexUuid: testRexes[0].uuid, maestroControlled: true });
      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe("failure");
      expect(res.body.message).toBe("Unauthorized");
    });

    test("Returns auth failure with invalid emss-token", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", "invalid-token")
        .send({ rexUuid: testRexes[0].uuid, maestroControlled: true });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST request - Validation", () => {
    test("Missing rexUuid", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ maestroControlled: true });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("Missing required body parameter");
    });

    test("All optional parameters missing", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[0].uuid });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("At least one of");
    });

    test("Invalid startStopExecution value", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({
          rexUuid: testRexes[0].uuid,
          maestroControlled: true,
          startStopExecution: "invalid",
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("startStopExecution must be 'start' or 'stop'");
    });

    test("Invalid maestroEventUrl", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[0].uuid, maestroEventUrl: "not-a-valid-url" });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain("Must be a valid URL");

      const res2 = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[0].uuid, maestroEventUrl: "something://invalid-protocol.com" });
      expect(res2.statusCode).toBe(400);
      expect(res2.body.message).toContain("Invalid protocol");
    });
  });

  describe("POST request - Business Logic", () => {
    test("Returns 404 for non-existent rex", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: "non-existent-uuid", maestroControlled: true });
      expect(res.statusCode).toBe(404);
      expect(res.body.message).toContain("not found");
    });

    test("Successfully updates rex control settings (full payload)", async () => {
      const activityProperties: MaestroActivityProperties = {
        "activity-uuid-1": { color: "#ff0000", number: "1" },
        "activity-uuid-2": { color: "#00ff00", number: "2" },
      };
      const requestBody = {
        rexUuid: testRexes[0].uuid,
        maestroControlled: true,
        startStopExecution: "start",
        maestroEventId: "updated-event-67890",
        maestroActivityProperties: activityProperties,
      };

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send(requestBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data[0].uuid).toBe(testRexes[0].uuid);

      const mission = await getMissionDoc();
      const updatedRex = mission.rexes[testRexes[0].uuid];
      expect(updatedRex.maestroControlled).toBe(true);
      expect(updatedRex.isRunning).toBe(true);
      expect(updatedRex.maestroEventId).toBe(requestBody.maestroEventId);
      expect(updatedRex.maestroActivityPropertiesByRefUuid).toEqual(activityProperties);
      // starting also creates initial pos entries — one per pos source, each
      // containing all pos types
      expect(updatedRex.posEntries.length).toBe(3);
      expect(updatedRex.posEntries[0].posTypeUuids.length).toBe(3);
    });

    test("Successfully updates maestroControlled in isolation", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[0].uuid, maestroControlled: true });
      expect(res.statusCode).toBe(200);
      const mission = await getMissionDoc();
      expect(mission.rexes[testRexes[0].uuid].maestroControlled).toBe(true);
    });

    test("Successfully updates maestro event id", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[0].uuid, maestroEventId: "event-update-12345" });
      expect(res.statusCode).toBe(200);
      expect(res.body.data[0].maestroEventId).toBe("event-update-12345");
      const mission = await getMissionDoc();
      expect(mission.rexes[testRexes[0].uuid].maestroEventId).toBe("event-update-12345");
    });

    test("Successfully updates execution state", async () => {
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[1].uuid, startStopExecution: "start" });
      expect(res.statusCode).toBe(200);
      const mission = await getMissionDoc();
      expect(mission.rexes[testRexes[1].uuid].isRunning).toBe(true);
    });

    test("Successfully updates rex control settings with false values", async () => {
      // first make rex[1] running so the stop has something to stop
      await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[1].uuid, startStopExecution: "start" });

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({
          rexUuid: testRexes[1].uuid,
          maestroControlled: false,
          startStopExecution: "stop",
          maestroEventId: "disabled-event-00000",
        });
      expect(res.statusCode).toBe(200);
      const mission = await getMissionDoc();
      const updated = mission.rexes[testRexes[1].uuid];
      expect(updated.maestroControlled).toBe(false);
      expect(updated.isRunning).toBe(false);
      expect(updated.maestroEventId).toBe("disabled-event-00000");
    });

    test("Starting one rex stops all other running rexes", async () => {
      // Make testRexes[0] running first
      const handle = await globalValues.automergeRepo.find(
        testAutomergeDocListings[0].automergeUrl as AutomergeUrl
      );
      handle.change((m: Mission) => {
        m.rexes[testRexes[0].uuid].isRunning = true;
      });

      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[1].uuid, startStopExecution: "start" });
      expect(res.statusCode).toBe(200);

      const mission = await getMissionDoc();
      expect(mission.rexes[testRexes[1].uuid].isRunning).toBe(true);
      expect(mission.rexes[testRexes[0].uuid].isRunning).toBe(false);
    });

    test("Successfully updates maestroActivityProperties only", async () => {
      const activityProperties: MaestroActivityPropertiesByRefUuid = {
        "activity-refUuid-test": { color: "#ffffff", number: "1A" },
      };
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({
          rexUuid: testRexes[0].uuid,
          maestroActivityProperties: activityProperties,
        });
      expect(res.statusCode).toBe(200);
      const mission = await getMissionDoc();
      expect(mission.rexes[testRexes[0].uuid].maestroActivityPropertiesByRefUuid).toEqual(
        activityProperties
      );
    });

    test("Empty string for maestroEventId clears the existing value", async () => {
      // First set an initial value
      await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[0].uuid, maestroEventId: "initial-event-123" });

      // Then clear it
      const res = await supertest(app)
        .post("/api/v1/emss/rexControl")
        .set("emss-token", emssToken)
        .send({ rexUuid: testRexes[0].uuid, maestroEventId: "" });
      expect(res.statusCode).toBe(200);

      const mission = await getMissionDoc();
      const finalId = mission.rexes[testRexes[0].uuid].maestroEventId;
      // route normalizes empty string -> null in automerge
      expect(finalId === null || finalId === "").toBe(true);
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
