import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { Doc_Listing_db } from "server/database/models/_allModels";
import DocListingFactory from "../../fixtures/entityFactories/DocListingFactory";
import { createMockAutomergeRepo } from "../../helpers/mockAutomergeRepo";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { overwriteRex } from "server/maestro/v1/rexOverwrite";
import { validateRexOverwrite } from "server/maestro/v1/rexOverwriteValidator";
import type { AutomergeUrl } from "@automerge/automerge-repo";

// suppress socketio side-effects (no real socket server in tests).
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
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  await resetRexes();
});

describe("validateRexOverwrite", () => {
  describe("Authentication / schema", () => {
    test("Returns error message with invalid payload", () => {
      const result = validateRexOverwrite({ invalidField: "value" } as unknown as RexOverwrite);
      expect(result).not.toBeNull();
    });
  });

  describe("Field validation", () => {
    test("Fails if rexUuid is not a valid UUID", () => {
      const result = validateRexOverwrite({ ...validRexOverwrite, uuid: "invalid-uuid" });
      expect(result).toBe("rexUuid must be a valid UUID.");
    });

    test("Fails if petRunning is true but isRunning is false", () => {
      const result = validateRexOverwrite({
        ...validRexOverwrite,
        petRunning: true,
        isRunning: false,
      });
      expect(result).toBe("Rex must be running (isRunning=true) in order to set petRunning=true.");
    });

    test("Fails if petValueAtStartStop is not in HHMMSS format", () => {
      const result = validateRexOverwrite({
        ...validRexOverwrite,
        petValueAtStartStop: "invalid",
      });
      expect(result).toBe("PetValueAtStartStop must be HHMMSS format.");
    });

    test("Fails if petStartStopTimestamp is not an ISO string", () => {
      const result = validateRexOverwrite({
        ...validRexOverwrite,
        petStartStopTimestamp: "invalid",
      });
      expect(result).toBe("petStartStopTimestamp must be an ISO String format.");
    });

    test("Fails if maestroEventUrl is not a valid URL", () => {
      const result = validateRexOverwrite({
        ...validRexOverwrite,
        maestroEventUrl: "invalid-url",
      });
      expect(result).toContain("MaestroEventURL be a valid URL");
    });

    describe("maestroActivityPropertiesByRefUuid validation", () => {
      test("Fails if invalid color", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          maestroActivityPropertiesByRefUuid: { egress: { color: "green", number: "1" } },
        });
        expect(result).toContain("maestroActivityPropertiesByRefUuid");
      });

      test("Fails if number length is greater than 3", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          maestroActivityPropertiesByRefUuid: {
            egress: { color: "#ffffff", number: "1011" },
          },
        });
        expect(result).toContain("Invalid number property");
      });
    });

    describe("stationEntriesByRefUuid validation", () => {
      test("Fails if invalid station refUuid", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          stationEntriesByRefUuid: { "invalid-uuid": { rexStatus: "complete" } },
        });
        expect(result).toContain("Invalid stationRefUuid");
      });

      test("Fails if percent complete is out of range", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          stationEntriesByRefUuid: {
            [testStation.refUuid]: { rexStatus: "complete", maestroPercentCompleteEv1: 150 },
          },
        });
        expect(result).toContain(
          "Entry must have a valid maestroPercentCompleteEv1 property between 0 and 100."
        );
      });
    });

    describe("traverseEntriesByRefUuid validation", () => {
      test("Fails if invalid traverse refUuid", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          traverseEntriesByRefUuid: { "invalid-uuid": { rexStatus: "complete" } },
        });
        expect(result).toContain("Invalid traverseRefUuid");
      });

      test("Fails if percent complete is negative", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          traverseEntriesByRefUuid: {
            [testTraverse.refUuid]: { rexStatus: "complete", maestroPercentCompleteEv2: -10 },
          },
        });
        expect(result).toContain(
          "Entry must have a valid maestroPercentCompleteEv2 property between 0 and 100."
        );
      });
    });

    describe("actionEntriesByRefUuid mass validation", () => {
      test("Fails if mass = 1 (mass should not be provided)", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: { rexStatus: "complete", mass: 1 },
          },
        });
        expect(result).toContain("Action entry mass property should not be provided.");
      });

      test("Fails if mass = 0", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: { rexStatus: "complete", mass: 0 },
          },
        });
        expect(result).toContain("Action entry mass property should not be provided.");
      });

      test("Fails if mass is null", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: { rexStatus: "complete", mass: null },
          } as ActionEntries,
        });
        expect(result).not.toBeNull();
      });

      test("Fails if containerId > 20 characters", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: {
              rexStatus: "complete",
              containerId: "a".repeat(21),
            },
          },
        });
        expect(result).toContain("containerId must be less than 20 characters.");
      });

      test("Fails if secondaryContainerId > 20 characters", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: {
              rexStatus: "complete",
              secondaryContainerId: "a".repeat(21),
            },
          },
        });
        expect(result).toContain("secondaryContainerId must be less than 20 characters.");
      });

      test("Fails if markerId > 20 characters", () => {
        const result = validateRexOverwrite({
          ...validRexOverwrite,
          actionEntriesByRefUuid: {
            [testStationAction.refUuid]: {
              rexStatus: "complete",
              markerId: "a".repeat(21),
            },
          },
        });
        expect(result).toContain("markerId must be less than 20 characters.");
      });
    });

    // TODO(MR3): a coverage test for inbound xgress status belongs here once the
    // v1 contract is settled. `xgressEntries` left RexOverwrite when egress and
    // ingress became real stations, so there is no rule left to exercise.

    test("Returns null for a valid payload", () => {
      const result = validateRexOverwrite(validRexOverwrite);
      expect(result).toBeNull();
    });
  });
});

describe("overwriteRex", () => {
  test("Successfully overwrites a REX, stops the previously-running one, returns both", async () => {
    const result = await overwriteRex(validRexOverwrite);

    // Two rexes returned: the one we updated + the previously running one we stopped
    expect(result.length).toBe(2);

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

  test("Throws if rex uuid is not found in any mission", async () => {
    await expect(
      overwriteRex({ ...validRexOverwrite, uuid: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow("not found");
  });

  test("Returns empty array if rexOverwrite is falsy", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await overwriteRex(null as any);
    expect(result).toEqual([]);
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
