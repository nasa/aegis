import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import type { STM_Level3_db } from "server/database/models/_allModels";
import {
  App_User_db,
  Layer_db,
  Sublayer_db,
  Preset_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Rule_db,
  Folder_db,
  Doc_Listing_db,
} from "server/database/models/_allModels";
import { fetchMissionSourceData, createMissionCopy } from "utils/dup/core";
import { initializeUuidMaps } from "utils/dup/helpers";
import AppUserFactory from "../fixtures/entityFactories/AppUserFactory";
import { getAll } from "../../../server/express/routes/all";
import isEqual from "lodash/isEqual";
import { deleteAutomergeMissions } from "server/express/routes/missionAutomerge";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { createMockAutomergeRepo } from "../helpers/mockAutomergeRepo";
import DocListingFactory from "../fixtures/entityFactories/DocListingFactory";
import { seedDatabaseAndGenerateAutomergeMission } from "../fixtures/database";

// These global variables will store our test data
let testAppUser: App_User_db;
let testMission: Mission;
let duplicatedMissionId: number;
let uuidMaps: EntityMaps;
let sourceData: MissionSourceData;

// Helper function to omit properties we expect to be different
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const omitChangingProps = <T extends Record<string, any>>(
  obj: T,
  propsToOmit: string[]
): Partial<T> => {
  const result: Partial<T> = {};
  Object.keys(obj).forEach((key) => {
    if (!propsToOmit.includes(key)) {
      result[key as keyof T] = obj[key];
    }
  });
  return result;
};

// Helper function to safely serialize objects for comparison,
// removing all collections and complex objects that might cause issues

//eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeSerialize = <T extends Record<string, any>>(obj: T): Partial<T> => {
  const result: Partial<T> = {};

  Object.entries(obj).forEach(([key, value]) => {
    // Skip Collections, Date objects, and complex nested objects
    if (
      value === null ||
      value === undefined ||
      typeof value === "function" ||
      (typeof value === "object" && value.isInitialized) || // MikroORM Collection
      value instanceof Date ||
      (Array.isArray(value) && value.some((item) => typeof item === "object" && item !== null))
    ) {
      return;
    }

    // Include primitive values and simple arrays
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every((item) => typeof item !== "object" || item === null))
    ) {
      // Use type assertion to tell TypeScript we know this value is of the correct type
      result[key as keyof T] = value as T[keyof T];
    }

    // For simple objects (like AEGISPoint), include them serialized
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      try {
        // Check if serializable without circular refs
        JSON.stringify(value);
        result[key as keyof T] = value as T[keyof T];
      } catch (e) {
        // Skip non-serializable objects
      }
    }
  });

  return result;
};

// What properties to exclude in comparisons for each entity type
const CHANGING_PROPS = {
  mission: ["id", "uuid", "createdAt", "updatedAt", "name", "version"],
  stmLevel1: ["uuid", "missionId", "createdAt", "updatedAt", "level2s", "version"],
  stmLevel2: ["uuid", "level1", "createdAt", "updatedAt", "level3s", "version"],
  stmLevel3: ["uuid", "level2", "createdAt", "updatedAt", "version"],
  // Add more entity types as needed
};

let originalFullStore: OneMissionToRuleThemAll;

const MOCK_AUTOMERGE_URL = "automerge:VitestDupTestMission";

/**
 * Pull the duplicated mission's automerge doc out of the mock repo. Cached
 * lazily — the doc is created once in the first describe block, then reused.
 */
let _duplicatedMissionDoc: Mission | null = null;
const getDuplicatedMission = async (): Promise<Mission> => {
  if (_duplicatedMissionDoc) return _duplicatedMissionDoc;
  const em = globalValues.orm.em.fork();
  const docListing = await em.findOne(Doc_Listing_db, { missionId: duplicatedMissionId });
  if (!docListing) throw new Error("Duplicated mission doc listing not found");
  const handle: DocHandle<Mission> = await globalValues.automergeRepo.find(
    docListing.automergeUrl as AutomergeUrl
  );
  await handle.whenReady();
  _duplicatedMissionDoc = handle.doc();
  return _duplicatedMissionDoc;
};

describe("Mission Duplication Tests", () => {
  beforeAll(async () => {
    // Initialize MikroORM and set it in globalValues
    // Enable allowGlobalContext for this test specifically to allow using the global EM instance.
    // This is required because this test calls getAll(), which internally calls route functions
    // These route functions use globalValues.orm.em directly
    // (without forking) because in production they are called within Express request handlers
    // where the request context is already established.
    globalValues.orm = await MikroORM.init({ ...config, allowGlobalContext: true });
    const em = globalValues.orm.em.fork();

    // Set up the mock automerge repo with our test mission shape
    globalValues.automergeRepo = createMockAutomergeRepo([{ name: "Vitest Dup Test Mission" }]);

    // Create a doc listing entry in the real DB using the mock's predictable URL
    const docListing = await new DocListingFactory(em).createOne({
      automergeUrl: MOCK_AUTOMERGE_URL,
    });
    const missionId = docListing.missionId;

    // Update the mock handle's doc to have the correct DB-assigned mission ID
    const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
      MOCK_AUTOMERGE_URL as AutomergeUrl
    );
    await missionDocHandle.whenReady();
    missionDocHandle.change((doc: Mission) => {
      doc.id = missionId;
    });

    // Create a fully potted test mission covering all entity types and relationships.
    await seedDatabaseAndGenerateAutomergeMission(em, missionId, missionDocHandle);

    // Create a test user with permissions for our test mission
    testAppUser = await new AppUserFactory(em).createOne({
      username: "VitestMissionUtils",
      permissionList: [
        {
          missionId,
          permissions: {
            edit: true,
            view: true,
          },
        },
      ],
    });

    // Initialize UUID maps to track the mapping between original and duplicate entities
    uuidMaps = initializeUuidMaps();

    // Get testMission from the mock automerge handle
    testMission = missionDocHandle.doc() as unknown as Mission;

    // Fetch source mission data
    sourceData = await fetchMissionSourceData(em, missionId);

    // Populate originalFullStore with the state of the mission before duplication
    originalFullStore = await getAll(missionId);
  });

  describe("Mission Duplication", () => {
    test("Should duplicate a mission record", async () => {
      const em = globalValues.orm.em.fork();

      // Create a duplicate mission and capture the UUID mappings by passing our UUID maps
      duplicatedMissionId = await createMissionCopy(
        em,
        sourceData,
        {
          nameSuffix: "Vitest Test Copy",
          copyAssets: false, // We're just testing database operations, not file operations
        },
        uuidMaps // Pass our UUID maps to be populated during duplication
      );

      // Verify the duplicated mission exists
      expect(duplicatedMissionId).toBeDefined();
      expect(duplicatedMissionId).not.toEqual(testMission.id);

      // Fetch the duplicated mission from automerge
      const duplicatedAutomergeRecord = await em.findOne(Doc_Listing_db, {
        missionId: duplicatedMissionId,
      });
      expect(duplicatedAutomergeRecord).toBeDefined();

      const duplicatedDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
        duplicatedAutomergeRecord.automergeUrl as AutomergeUrl
      );
      await duplicatedDocHandle.whenReady();
      const duplicatedMission = duplicatedDocHandle.doc();

      // Check the duplicated mission properties
      expect(duplicatedMission).not.toBeNull();
      expect(duplicatedMission?.name).toEqual(`${testMission.name} - Vitest Test Copy`);

      // Compare relevant properties excluding ones we expect to be different
      const originalMissionProps = omitChangingProps(sourceData.mission, CHANGING_PROPS.mission);
      const duplicatedMissionProps = duplicatedMission
        ? omitChangingProps(duplicatedMission, CHANGING_PROPS.mission)
        : {};

      expect(duplicatedMissionProps).toEqual(originalMissionProps);
    });
  });

  // Duplicating a mission creates a new doc that inherits the
  // entire stations collection 1:1 — same uuids, same content.
  describe("Station Duplication", () => {
    test("Duplicated mission has the same stations (same uuids and content) as the source", async () => {
      const originalStations = sourceData.mission.stations ?? {};
      expect(Object.keys(originalStations).length).toBeGreaterThan(0);

      const duplicatedMission = await getDuplicatedMission();
      const duplicatedStations = duplicatedMission.stations ?? {};

      expect(Object.keys(duplicatedStations).length).toEqual(Object.keys(originalStations).length);

      for (const [uuid, originalStation] of Object.entries(originalStations)) {
        const duplicatedStation = duplicatedStations[uuid];
        expect(duplicatedStation).toBeDefined();
        // Full content equality — stations are plain JSON in automerge
        expect(duplicatedStation).toEqual(originalStation);
      }
    });

    test("actionOrderUuids on stations are preserved verbatim", async () => {
      const stationsWithActions = Object.values(sourceData.mission.stations ?? {}).filter(
        (station: Station) => station.actionOrderUuids && station.actionOrderUuids.length > 0
      );
      if (stationsWithActions.length === 0) {
        console.warn("No stations with action order UUIDs to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalStation of stationsWithActions) {
        const duplicatedStation = duplicatedMission.stations?.[originalStation.uuid];
        expect(duplicatedStation).toBeDefined();
        expect(duplicatedStation.actionOrderUuids).toEqual(originalStation.actionOrderUuids);
      }
    });
  });

  describe("POI Duplication", () => {
    test("Duplicated mission has the same POIs (same uuids and content) as the source", async () => {
      const originalPois = sourceData.mission.pois ?? {};
      if (Object.keys(originalPois).length === 0) {
        console.warn("No POIs to test in the source mission");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      const duplicatedPois = duplicatedMission.pois ?? {};

      expect(Object.keys(duplicatedPois).length).toEqual(Object.keys(originalPois).length);

      for (const [uuid, originalPoi] of Object.entries(originalPois)) {
        const duplicatedPoi = duplicatedPois[uuid];
        expect(duplicatedPoi).toBeDefined();
        expect(duplicatedPoi).toEqual(originalPoi);
      }
    });

    test("actionOrderUuids on POIs are preserved verbatim", async () => {
      const poisWithActions = Object.values(sourceData.mission.pois ?? {}).filter(
        (poi: POI) => poi.actionOrderUuids && poi.actionOrderUuids.length > 0
      );
      if (poisWithActions.length === 0) {
        console.warn("No POIs with action order UUIDs to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalPoi of poisWithActions) {
        const duplicatedPoi = duplicatedMission.pois?.[originalPoi.uuid];
        expect(duplicatedPoi).toBeDefined();
        expect(duplicatedPoi.actionOrderUuids).toEqual(originalPoi.actionOrderUuids);
      }
    });
  });

  describe("Action Duplication", () => {
    test("Duplicated mission has the same actions (same uuids and content) as the source", async () => {
      const originalActions = sourceData.mission.actions ?? {};
      if (Object.keys(originalActions).length === 0) {
        console.warn("No actions to test in the source mission");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      const duplicatedActions = duplicatedMission.actions ?? {};

      expect(Object.keys(duplicatedActions).length).toEqual(Object.keys(originalActions).length);

      for (const [uuid, originalAction] of Object.entries(originalActions)) {
        const duplicatedAction = duplicatedActions[uuid];
        expect(duplicatedAction).toBeDefined();
        expect(duplicatedAction).toEqual(originalAction);
      }
    });

    test("action.stationUuid references on the duplicated mission still point at valid stations", async () => {
      const actionsWithStations = Object.values(sourceData.mission.actions ?? {}).filter(
        (action: Action) => !!action.stationUuid
      );
      if (actionsWithStations.length === 0) {
        console.warn("No actions with station relationships to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalAction of actionsWithStations) {
        const duplicatedAction = duplicatedMission.actions?.[originalAction.uuid];
        expect(duplicatedAction).toBeDefined();
        // uuid is preserved, so the stationUuid pointer should be unchanged AND
        // the station it points at should still exist on the duplicated mission.
        expect(duplicatedAction.stationUuid).toEqual(originalAction.stationUuid);
        expect(duplicatedMission.stations?.[duplicatedAction.stationUuid]).toBeDefined();
      }
    });

    test("action.poiUuid references on the duplicated mission still point at valid POIs", async () => {
      const actionsWithPois = Object.values(sourceData.mission.actions ?? {}).filter(
        (action: Action) => !!action.poiUuid
      );
      if (actionsWithPois.length === 0) {
        console.warn("No actions with POI relationships to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalAction of actionsWithPois) {
        const duplicatedAction = duplicatedMission.actions?.[originalAction.uuid];
        expect(duplicatedAction).toBeDefined();
        expect(duplicatedAction.poiUuid).toEqual(originalAction.poiUuid);
        expect(duplicatedMission.pois?.[duplicatedAction.poiUuid]).toBeDefined();
      }
    });

    test("action.traverseUuid references on the duplicated mission still point at valid traverses", async () => {
      const actionsWithTraverses = Object.values(sourceData.mission.actions ?? {}).filter(
        (action: Action) => !!action.traverseUuid
      );
      if (actionsWithTraverses.length === 0) {
        console.warn("No actions with traverse relationships to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalAction of actionsWithTraverses) {
        const duplicatedAction = duplicatedMission.actions?.[originalAction.uuid];
        expect(duplicatedAction).toBeDefined();
        expect(duplicatedAction.traverseUuid).toEqual(originalAction.traverseUuid);
        expect(duplicatedMission.traverses?.[duplicatedAction.traverseUuid]).toBeDefined();
      }
    });

    test("action.parentActionUuid references on the duplicated mission still point at valid parent actions", async () => {
      // parentActionUuid records the original POI action an action was derived
      // from when it was duplicated into having a station parent. Since uuids
      // are preserved 1:1 inside an automerge mission doc, the parent pointer
      // is unchanged — just verify the referenced action still exists.
      const actionsWithParent = Object.values(sourceData.mission.actions ?? {}).filter(
        (action: Action) => !!action.parentActionUuid
      );
      if (actionsWithParent.length === 0) {
        console.warn("No actions with parentAction audit trail to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalAction of actionsWithParent) {
        const duplicatedAction = duplicatedMission.actions?.[originalAction.uuid];
        expect(duplicatedAction).toBeDefined();
        expect(duplicatedAction.parentActionUuid).toEqual(originalAction.parentActionUuid);
        expect(duplicatedMission.actions?.[duplicatedAction.parentActionUuid]).toBeDefined();
      }
    });
  });

  describe("Traverse Duplication", () => {
    test("Duplicated mission has the same traverses (same uuids and content) as the source", async () => {
      const originalTraverses = sourceData.mission.traverses ?? {};
      if (Object.keys(originalTraverses).length === 0) {
        console.warn("No traverses to test in the source mission");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      const duplicatedTraverses = duplicatedMission.traverses ?? {};

      expect(Object.keys(duplicatedTraverses).length).toEqual(
        Object.keys(originalTraverses).length
      );

      for (const [uuid, originalTraverse] of Object.entries(originalTraverses)) {
        const duplicatedTraverse = duplicatedTraverses[uuid];
        expect(duplicatedTraverse).toBeDefined();
        expect(duplicatedTraverse).toEqual(originalTraverse);
      }
    });

    test("actionOrderUuids on traverses are preserved verbatim", async () => {
      const traversesWithActions = Object.values(sourceData.mission.traverses ?? {}).filter(
        (traverse) => traverse.actionOrderUuids && traverse.actionOrderUuids.length > 0
      );
      if (traversesWithActions.length === 0) {
        console.warn("No traverses with action order UUIDs to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalTraverse of traversesWithActions) {
        const duplicatedTraverse = duplicatedMission.traverses?.[originalTraverse.uuid];
        expect(duplicatedTraverse).toBeDefined();
        expect(duplicatedTraverse.actionOrderUuids).toEqual(originalTraverse.actionOrderUuids);
      }
    });
  });

  describe("Layer and Sublayer Duplication", () => {
    test("Should duplicate all layers with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no layers to test
      if (sourceData.layers.length === 0) {
        console.warn("No layers to test in the source mission");
        return;
      }

      // 1. Get all layers from the original mission
      const originalLayers = sourceData.layers;

      // 2. Get all layers from the duplicated mission
      const duplicatedLayers = await em.find(Layer_db, { missionId: duplicatedMissionId });
      expect(duplicatedLayers.length).toEqual(originalLayers.length);

      // 3. Verify layers were correctly duplicated
      for (const originalLayer of originalLayers) {
        // Get the mapped UUID
        const newUuid = uuidMaps.layers.get(originalLayer.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated layer with this UUID
        const duplicatedLayer = duplicatedLayers.find((l) => l.uuid === newUuid);
        expect(duplicatedLayer).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedLayer) {
          // Compare layer name (should be identical)
          expect(duplicatedLayer.name).toEqual(originalLayer.name);

          // Verify the mission ID was updated
          expect(duplicatedLayer.missionId).toEqual(duplicatedMissionId);
        }
      }
    });

    test("Should duplicate all sublayers with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no sublayers to test
      if (sourceData.sublayers.length === 0) {
        console.warn("No sublayers to test in the source mission");
        return;
      }

      // 1. Get all sublayers from the original mission
      const originalSublayers = sourceData.sublayers;

      // 2. Get all sublayers from the duplicated mission
      const duplicatedSublayers = await em.find(Sublayer_db, {
        missionId: duplicatedMissionId,
      });
      expect(duplicatedSublayers.length).toEqual(originalSublayers.length);

      // 3. Verify sublayers were correctly duplicated
      for (const originalSublayer of originalSublayers) {
        // Get the mapped UUID
        const newUuid = uuidMaps.sublayers.get(originalSublayer.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated sublayer with this UUID
        const duplicatedSublayer = duplicatedSublayers.find((sl) => sl.uuid === newUuid);
        expect(duplicatedSublayer).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedSublayer) {
          // Compare sublayer name (should be identical)
          expect(duplicatedSublayer.name).toEqual(originalSublayer.name);

          // Verify the mission ID was updated
          expect(duplicatedSublayer.missionId).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalSublayerSimple = safeSerialize(originalSublayer);
          const duplicatedSublayerSimple = safeSerialize(duplicatedSublayer);

          // Compare relevant properties
          expect(duplicatedSublayerSimple.name).toEqual(originalSublayerSimple.name);
          expect(duplicatedSublayerSimple.description).toEqual(originalSublayerSimple.description);
          expect(duplicatedSublayerSimple.type).toEqual(originalSublayerSimple.type);
        }
      }
    });

    test("Should maintain sublayer-layer relationships", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no sublayers to test
      if (sourceData.sublayers.length === 0) {
        console.warn("No sublayers to test in the source mission");
        return;
      }

      // For each sublayer, check its relationship to its layer
      for (const originalSublayer of sourceData.sublayers) {
        if (!originalSublayer.layer || !originalSublayer.layer.uuid) {
          continue;
        }

        // Get the mapped UUIDs
        const newSublayerUuid = uuidMaps.sublayers.get(originalSublayer.uuid);
        const newLayerUuid = uuidMaps.layers.get(originalSublayer.layer.uuid);

        expect(newSublayerUuid).toBeDefined();
        expect(newLayerUuid).toBeDefined();

        // Get the duplicated sublayer with its layer relationship
        const duplicatedSublayer = await em.findOne(
          Sublayer_db,
          { uuid: newSublayerUuid },
          { populate: ["layer"] }
        );

        expect(duplicatedSublayer).toBeDefined();
        expect(duplicatedSublayer?.layer).toBeDefined();

        // Verify the sublayer-layer relationship was maintained
        if (duplicatedSublayer && duplicatedSublayer.layer) {
          expect(duplicatedSublayer.layer.uuid).toEqual(newLayerUuid);
        }
      }
    });
  });

  describe("EVA Duplication", () => {
    test("Duplicated mission has the same EVAs (same uuids and content) as the source", async () => {
      const originalEvas = sourceData.mission.evas ?? {};
      if (Object.keys(originalEvas).length === 0) {
        console.warn("No EVAs to test in the source mission");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      const duplicatedEvas = duplicatedMission.evas ?? {};

      expect(Object.keys(duplicatedEvas).length).toEqual(Object.keys(originalEvas).length);

      for (const [uuid, originalEva] of Object.entries(originalEvas)) {
        const duplicatedEva = duplicatedEvas[uuid];
        expect(duplicatedEva).toBeDefined();
        expect(duplicatedEva).toEqual(originalEva);
      }
    });

    test("EVA sequences are preserved verbatim and reference valid stations/traverses", async () => {
      const evasWithSequence = Object.values(sourceData.mission.evas ?? {}).filter(
        (eva) => eva.sequence && eva.sequence.length > 0
      );
      if (evasWithSequence.length === 0) {
        console.warn("No EVAs with sequences to test");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      for (const originalEva of evasWithSequence) {
        const duplicatedEva = duplicatedMission.evas?.[originalEva.uuid];
        expect(duplicatedEva).toBeDefined();
        expect(duplicatedEva.sequence).toEqual(originalEva.sequence);

        // Every sequence item must point at an entity that exists on the
        // duplicated mission (no dangling references).
        for (const item of duplicatedEva.sequence) {
          if (item.type === "station" && item.uuid) {
            expect(duplicatedMission.stations?.[item.uuid]).toBeDefined();
          } else if (item.type === "traverse" && item.uuid) {
            expect(duplicatedMission.traverses?.[item.uuid]).toBeDefined();
          }
        }
      }
    });

    test("EVA egress / ingress stations are preserved verbatim", async () => {
      const originalEvas = Object.values(sourceData.mission.evas ?? {}).filter(
        (eva) => eva.sequence?.length > 0
      );
      if (originalEvas.length === 0) return;

      const duplicatedMission = await getDuplicatedMission();
      for (const originalEva of originalEvas) {
        const duplicatedEva = duplicatedMission.evas?.[originalEva.uuid];
        expect(duplicatedEva).toBeDefined();

        // Egress and ingress are the first and last sequence items.
        const xgressItems = [
          duplicatedEva.sequence[0],
          duplicatedEva.sequence[duplicatedEva.sequence.length - 1],
        ];
        for (const item of xgressItems) {
          expect(item.type).toBe("station");
          expect(duplicatedMission.stations?.[item.uuid]).toBeDefined();
        }
      }
    });
  });

  describe("STM Entity Duplication", () => {
    test("Should duplicate STM Level 1 entities", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no STM Level 1s to test
      if (!sourceData.stmLevel1s || sourceData.stmLevel1s.length === 0) {
        console.warn("No STM Level 1 entities to test in the source mission");
        return;
      }

      // 1. Get all STM Level 1s from the original mission
      const originalStmLevel1s = sourceData.stmLevel1s;

      // 2. Get all STM Level 1s from the duplicated mission
      const duplicatedStmLevel1s = await em.find(STM_Level1_db, {
        missionId: duplicatedMissionId,
      });
      expect(duplicatedStmLevel1s.length).toEqual(originalStmLevel1s.length);

      // 3. Verify STM Level 1s were correctly duplicated
      for (const originalStm of originalStmLevel1s) {
        // Get the mapped UUID
        const newUuid = uuidMaps.stmLevel1s.get(originalStm.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated STM with this UUID
        const duplicatedStm = duplicatedStmLevel1s.find((s) => s.uuid === newUuid);
        expect(duplicatedStm).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedStm) {
          // Compare STM name and numbering (should be identical)
          expect(duplicatedStm.name).toEqual(originalStm.name);
          expect(duplicatedStm.numbering).toEqual(originalStm.numbering);

          // Verify the mission ID was updated
          expect(duplicatedStm.missionId).toEqual(duplicatedMissionId);
        }
      }
    });

    // Add this new test case for STM Level 2
    test("Should duplicate STM Level 2 entities with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no STM Level 2s to test
      if (!sourceData.stmLevel2s || sourceData.stmLevel2s.length === 0) {
        console.warn("No STM Level 2 entities to test in the source mission");
        return;
      }

      // 1. Get all STM Level 2s from the original mission
      const originalStmLevel2s = sourceData.stmLevel2s;

      // 2. Get all STM Level 2s from the duplicated mission
      // Fetch via Level 1 to ensure we get all related ones
      const duplicatedStmLevel1s = await em.find(
        STM_Level1_db,
        { missionId: duplicatedMissionId },
        { populate: ["level2s"] }
      );

      const duplicatedStmLevel2s: STM_Level2_db[] = [];
      for (const l1 of duplicatedStmLevel1s) {
        if (l1.level2s?.isInitialized()) {
          duplicatedStmLevel2s.push(...l1.level2s.getItems());
        }
      }

      expect(duplicatedStmLevel2s.length).toEqual(originalStmLevel2s.length);

      // 3. Verify STM Level 2s were correctly duplicated
      for (const originalStm of originalStmLevel2s) {
        // Get the mapped UUID
        const newUuid = uuidMaps.stmLevel2s.get(originalStm.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated STM with this UUID
        const duplicatedStm = duplicatedStmLevel2s.find((s) => s.uuid === newUuid);
        expect(duplicatedStm).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedStm) {
          // Compare simple properties
          expect(duplicatedStm.name).toEqual(originalStm.name);
          expect(duplicatedStm.numbering).toEqual(originalStm.numbering);
          // Add other relevant simple properties here

          // Verify the level1 relationship points to the new level1 UUID
          const originalLevel1Uuid = originalStm.level1?.uuid;
          const expectedNewLevel1Uuid = originalLevel1Uuid
            ? uuidMaps.stmLevel1s.get(originalLevel1Uuid)
            : undefined;
          expect(duplicatedStm.level1?.uuid).toEqual(expectedNewLevel1Uuid);
        }
      }
    });

    test("Should duplicate STM Level 3 entities with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no STM Level 3s to test
      if (!sourceData.stmLevel3s || sourceData.stmLevel3s.length === 0) {
        console.warn("No STM Level 3 entities to test in the source mission");
        return;
      }

      // 1. Get all STM Level 3s from the original mission
      const originalStmLevel3s = sourceData.stmLevel3s;

      // 2. Get all STM Level 3s from the duplicated mission
      // We need to fetch them indirectly via Level 1 and Level 2 due to the relationship structure
      const duplicatedStmLevel1s = await em.find(
        STM_Level1_db,
        { missionId: duplicatedMissionId },
        { populate: ["level2s.level3s"] }
      );

      const duplicatedStmLevel3s: STM_Level3_db[] = [];
      for (const l1 of duplicatedStmLevel1s) {
        if (l1.level2s?.isInitialized()) {
          for (const l2 of l1.level2s.getItems()) {
            if (l2.level3s?.isInitialized()) {
              duplicatedStmLevel3s.push(...l2.level3s.getItems());
            }
          }
        }
      }

      expect(duplicatedStmLevel3s.length).toEqual(originalStmLevel3s.length);

      // 3. Verify STM Level 3s were correctly duplicated
      for (const originalStm of originalStmLevel3s) {
        // Get the mapped UUID
        const newUuid = uuidMaps.stmLevel3s.get(originalStm.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated STM with this UUID
        const duplicatedStm = duplicatedStmLevel3s.find((s) => s.uuid === newUuid);
        expect(duplicatedStm).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedStm) {
          // Compare simple properties
          expect(duplicatedStm.name).toEqual(originalStm.name);
          expect(duplicatedStm.numbering).toEqual(originalStm.numbering);
          // Add other relevant simple properties here

          // Verify the level2 relationship points to the new level2 UUID
          const originalLevel2Uuid = originalStm.level2?.uuid;
          const expectedNewLevel2Uuid = originalLevel2Uuid
            ? uuidMaps.stmLevel2s.get(originalLevel2Uuid)
            : undefined;
          expect(duplicatedStm.level2?.uuid).toEqual(expectedNewLevel2Uuid);
        }
      }
    });

    test("Should maintain STM hierarchical relationships", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no STM entities to test
      if (
        !sourceData.stmLevel1s ||
        !sourceData.stmLevel2s ||
        !sourceData.stmLevel3s ||
        sourceData.stmLevel1s.length === 0
      ) {
        console.warn("No complete STM hierarchy to test in the source mission");
        return;
      }

      // Test Level1-Level2 relationships
      for (const originalLevel1 of sourceData.stmLevel1s) {
        // Find its Level2 children
        const originalLevel2s = sourceData.stmLevel2s.filter(
          (l2) => l2.level1 && l2.level1.uuid === originalLevel1.uuid
        );

        if (originalLevel2s.length === 0) continue;

        // Get the mapped Level1 UUID
        const newLevel1Uuid = uuidMaps.stmLevel1s.get(originalLevel1.uuid);
        expect(newLevel1Uuid).toBeDefined();

        // Get the duplicated Level1 with its Level2 collection
        const duplicatedLevel1 = await em.findOne(
          STM_Level1_db,
          { uuid: newLevel1Uuid },
          { populate: ["level2s"] }
        );

        expect(duplicatedLevel1).toBeDefined();

        if (!duplicatedLevel1 || !duplicatedLevel1.level2s) continue;

        // Ensure level2s collection is initialized
        if (duplicatedLevel1.level2s.isInitialized()) {
          const duplicatedLevel2s = duplicatedLevel1.level2s.getItems();

          // Verify the number of Level2 children matches
          expect(duplicatedLevel2s.length).toEqual(originalLevel2s.length);

          // Verify each Level2 child
          for (const originalLevel2 of originalLevel2s) {
            const newLevel2Uuid = uuidMaps.stmLevel2s.get(originalLevel2.uuid);
            expect(newLevel2Uuid).toBeDefined();

            // Check if the duplicated Level1 has this Level2 child
            const hasChild = duplicatedLevel2s.some(
              (l2: STM_Level2_db) => l2.uuid === newLevel2Uuid
            );
            expect(hasChild).toBeTruthy();
          }
        }
      }

      // Test Level2-Level3 relationships
      for (const originalLevel2 of sourceData.stmLevel2s) {
        // Find its Level3 children
        const originalLevel3s = sourceData.stmLevel3s.filter(
          (l3) => l3.level2 && l3.level2.uuid === originalLevel2.uuid
        );

        if (originalLevel3s.length === 0) continue;

        // Get the mapped Level2 UUID
        const newLevel2Uuid = uuidMaps.stmLevel2s.get(originalLevel2.uuid);
        expect(newLevel2Uuid).toBeDefined();

        // Get the duplicated Level2 with its Level3 collection
        const duplicatedLevel2 = await em.findOne(
          STM_Level2_db,
          { uuid: newLevel2Uuid },
          { populate: ["level3s"] }
        );

        expect(duplicatedLevel2).toBeDefined();

        if (!duplicatedLevel2 || !duplicatedLevel2.level3s) continue;

        // Ensure level3s collection is initialized
        if (duplicatedLevel2.level3s.isInitialized()) {
          const duplicatedLevel3s = duplicatedLevel2.level3s.getItems();

          // Verify the number of Level3 children matches
          expect(duplicatedLevel3s.length).toEqual(originalLevel3s.length);

          // Verify each Level3 child
          for (const originalLevel3 of originalLevel3s) {
            const newLevel3Uuid = uuidMaps.stmLevel3s.get(originalLevel3.uuid);
            expect(newLevel3Uuid).toBeDefined();

            // Check if the duplicated Level2 has this Level3 child
            const hasChild = duplicatedLevel3s.some(
              (l3: STM_Level3_db) => l3.uuid === newLevel3Uuid
            );
            expect(hasChild).toBeTruthy();
          }
        }
      }
    });

    test("Should duplicate STM rules with updated STM references", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no STM rules to test
      if (!sourceData.stmRules || sourceData.stmRules.length === 0) {
        console.warn("No STM rules to test in the source mission");
        return;
      }

      // 1. Get all STM rules from the original mission
      const originalStmRules = sourceData.stmRules;

      // 2. Get all STM rules from the duplicated mission
      const duplicatedStmRules = await em.find(STM_Rule_db, {
        missionId: duplicatedMissionId,
      });
      expect(duplicatedStmRules.length).toEqual(originalStmRules.length);

      // 3. Verify STM rules were correctly duplicated
      for (const originalRule of originalStmRules) {
        // Get the mapped UUID
        const newUuid = uuidMaps.stmRules.get(originalRule.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated rule with this UUID
        const duplicatedRule = duplicatedStmRules.find((r) => r.uuid === newUuid);
        expect(duplicatedRule).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedRule) {
          // Verify the mission ID was updated
          expect(duplicatedRule.missionId).toEqual(duplicatedMissionId);

          // Verify the stmUuid reference was updated
          const expectedNewStmUuid = uuidMaps.stmLevel3s.get(originalRule.stmUuid);
          expect(duplicatedRule.stmUuid).toEqual(expectedNewStmUuid);

          // Compare the simple properties
          expect(duplicatedRule.count).toEqual(originalRule.count);
          expect(duplicatedRule.verbAny).toEqual(originalRule.verbAny);
          expect(duplicatedRule.nounAny).toEqual(originalRule.nounAny);
          expect(duplicatedRule.adjectiveAny).toEqual(originalRule.adjectiveAny);

          // UUID arrays should be equal length
          if (originalRule.verbUuids) {
            expect(duplicatedRule.verbUuids).toHaveLength(originalRule.verbUuids.length);
          }
          if (originalRule.nounUuids) {
            expect(duplicatedRule.nounUuids).toHaveLength(originalRule.nounUuids.length);
          }
          if (originalRule.adjectiveUuids) {
            expect(duplicatedRule.adjectiveUuids).toHaveLength(originalRule.adjectiveUuids.length);
          }
        }
      }
    });
  });

  describe("Preset Duplication", () => {
    test("Should duplicate all presets with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no presets to test
      if (sourceData.presets.length === 0) {
        console.warn("No presets to test in the source mission");
        return;
      }

      // 1. Get all presets from the original mission
      const originalPresets = sourceData.presets;

      // 2. Get all presets from the duplicated mission
      const duplicatedPresets = await em.find(Preset_db, { missionId: duplicatedMissionId });
      expect(duplicatedPresets.length).toEqual(originalPresets.length);

      // 3. Verify presets were correctly duplicated
      for (const originalPreset of originalPresets) {
        // Get the mapped UUID
        const newUuid = uuidMaps.presets.get(originalPreset.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated preset with this UUID
        const duplicatedPreset = duplicatedPresets.find((p) => p.uuid === newUuid);
        expect(duplicatedPreset).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedPreset) {
          // Compare preset name (should be identical)
          expect(duplicatedPreset.name).toEqual(originalPreset.name);

          // Verify the mission ID was updated
          expect(duplicatedPreset.missionId).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalPresetSimple = safeSerialize(originalPreset);
          const duplicatedPresetSimple = safeSerialize(duplicatedPreset);

          // Compare relevant properties
          expect(duplicatedPresetSimple.name).toEqual(originalPresetSimple.name);
          expect(duplicatedPresetSimple.description).toEqual(originalPresetSimple.description);
          expect(duplicatedPresetSimple.missionDefault).toEqual(
            originalPresetSimple.missionDefault
          );

          // If the preset has layer ordering, ensure it's maintained
          if (originalPreset.layerOrder && originalPreset.layerOrder.length > 0) {
            expect(duplicatedPreset.layerOrder).toHaveLength(originalPreset.layerOrder.length);
          }
        }
      }
    });

    test("Should update layer and sublayer references in presets", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no presets with map sublayer controls
      const presetsWithLayerRefs = sourceData.presets.filter(
        (preset) => preset.mapSublayerControls && Object.keys(preset.mapSublayerControls).length > 0
      );

      if (presetsWithLayerRefs.length === 0) {
        console.warn("No presets with layer references to test");
        return;
      }

      for (const originalPreset of presetsWithLayerRefs) {
        // Get the mapped preset UUID
        const newPresetUuid = uuidMaps.presets.get(originalPreset.uuid);
        expect(newPresetUuid).toBeDefined();

        // Get the duplicated preset
        const duplicatedPreset = await em.findOne(Preset_db, { uuid: newPresetUuid });
        expect(duplicatedPreset).toBeDefined();

        if (!duplicatedPreset || !duplicatedPreset.mapSublayerControls) continue;

        // Get the original map sublayer controls
        const originalControls = originalPreset.mapSublayerControls;
        const duplicatedControls = duplicatedPreset.mapSublayerControls;

        // For each sublayer UUID in the original controls
        for (const originalSublayerUuid of Object.keys(originalControls)) {
          // Get the mapped sublayer UUID
          const newSublayerUuid = uuidMaps.sublayers.get(originalSublayerUuid);

          // If we have a mapping for this sublayer UUID
          if (newSublayerUuid) {
            // Check that the new sublayer UUID exists as a key in the duplicated controls
            expect(duplicatedControls).toHaveProperty(newSublayerUuid);

            // Check that the sublayerUuid property inside the control object is the new UUID
            expect(duplicatedControls[newSublayerUuid].sublayerUuid).toBe(newSublayerUuid);

            // Compare the rest of the properties, excluding the sublayerUuid which we know is different
            expect(
              omitChangingProps(duplicatedControls[newSublayerUuid], ["sublayerUuid"])
            ).toEqual(omitChangingProps(originalControls[originalSublayerUuid], ["sublayerUuid"]));
          }
        }
      }
    });
  });

  describe("REX Duplication", () => {
    test("Duplicated mission has the same REXes (same uuids and content) as the source", async () => {
      const originalRexes = sourceData.mission.rexes ?? {};
      if (Object.keys(originalRexes).length === 0) {
        console.warn("No REX entities to test in the source mission");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();
      const duplicatedRexes = duplicatedMission.rexes ?? {};

      expect(Object.keys(duplicatedRexes).length).toEqual(Object.keys(originalRexes).length);

      for (const [uuid, originalRex] of Object.entries(originalRexes)) {
        const duplicatedRex = duplicatedRexes[uuid];
        expect(duplicatedRex).toBeDefined();
        expect(duplicatedRex).toEqual(originalRex);
        // Pointer to the rex's EVA should still resolve on the duplicated mission.
        if (duplicatedRex.evaUuid) {
          expect(duplicatedMission.evas?.[duplicatedRex.evaUuid]).toBeDefined();
        }
      }
    });

    test("REX entry maps (station/traverse/action) keep their original entity uuids", async () => {
      const allRexes = Object.values(sourceData.mission.rexes ?? {});
      if (allRexes.length === 0) {
        console.warn("No REX entities to test in the source mission");
        return;
      }

      const duplicatedMission = await getDuplicatedMission();

      for (const originalRex of allRexes) {
        const duplicatedRex = duplicatedMission.rexes?.[originalRex.uuid];
        expect(duplicatedRex).toBeDefined();

        // stationEntries
        if (originalRex.stationEntries) {
          expect(duplicatedRex.stationEntries).toEqual(originalRex.stationEntries);
          for (const stationUuid of Object.keys(originalRex.stationEntries)) {
            expect(duplicatedMission.stations?.[stationUuid]).toBeDefined();
          }
        }

        // traverseEntries
        if (originalRex.traverseEntries) {
          expect(duplicatedRex.traverseEntries).toEqual(originalRex.traverseEntries);
          for (const traverseUuid of Object.keys(originalRex.traverseEntries)) {
            expect(duplicatedMission.traverses?.[traverseUuid]).toBeDefined();
          }
        }

        // actionEntries
        if (originalRex.actionEntries) {
          expect(duplicatedRex.actionEntries).toEqual(originalRex.actionEntries);
          for (const actionUuid of Object.keys(originalRex.actionEntries)) {
            expect(duplicatedMission.actions?.[actionUuid]).toBeDefined();
          }
        }
      }
    });
  });

  describe("Grid Duplication", () => {
    test("Should copy the grid metadata onto the duplicated mission doc", async () => {
      const em = globalValues.orm.em.fork();

      // Grid metadata now lives on the mission Automerge doc (mission.serverFileGrid).
      // Skip if the source mission has no grid.
      if (!sourceData.mission.serverFileGrid) {
        console.warn("No grid to test in the source mission");
        return;
      }

      const docListing = await em.findOne(Doc_Listing_db, { missionId: duplicatedMissionId });
      expect(docListing).toBeDefined();
      const missionDocHandle: DocHandle<Mission> = await globalValues.automergeRepo.find(
        docListing.automergeUrl as AutomergeUrl
      );
      await missionDocHandle.whenReady();
      const duplicatedMission = missionDocHandle.doc();
      expect(duplicatedMission).toBeDefined();

      // The grid metadata rides along on the mission doc copy verbatim.
      expect(duplicatedMission.serverFileGrid).toEqual(sourceData.mission.serverFileGrid);
    });
  });

  // Folders themselves are DB-backed (Folder_db) and get new uuids during dup
  // (tracked in uuidMaps.folders). The entities they point at are split:
  //   - poi / station / eva items live on the Automerge mission doc and KEEP
  //     their original uuids when the mission is duplicated.
  //   - preset / layer items live in postgres and DO get fresh uuids via
  //     `uuidMaps.presets` / `uuidMaps.layers`.
  describe("Folder Duplication", () => {
    test("Folders are duplicated with new folder uuids and preserved item lists", async () => {
      const em = globalValues.orm.em.fork();
      if (sourceData.folders.length === 0) {
        console.warn("No folders to test in the source mission");
        return;
      }

      const originalFolders = sourceData.folders;
      const duplicatedFolders = await em.find(Folder_db, { missionId: duplicatedMissionId });
      expect(duplicatedFolders.length).toEqual(originalFolders.length);

      for (const originalFolder of originalFolders) {
        const newUuid = uuidMaps.folders.get(originalFolder.uuid);
        expect(newUuid).toBeDefined();

        const duplicatedFolder = duplicatedFolders.find((f) => f.uuid === newUuid);
        expect(duplicatedFolder).toBeDefined();
        if (!duplicatedFolder) continue;

        expect(duplicatedFolder.name).toEqual(originalFolder.name);
        expect(duplicatedFolder.missionId).toEqual(duplicatedMissionId);
        expect(duplicatedFolder.type).toEqual(originalFolder.type);
        expect(duplicatedFolder.items.length).toEqual(originalFolder.items.length);
      }
    });

    test("Folder item uuids: automerge entity items are preserved, DB-backed items are remapped", async () => {
      const em = globalValues.orm.em.fork();
      if (sourceData.folders.length === 0) return;

      for (const originalFolder of sourceData.folders) {
        if (!originalFolder.items || originalFolder.items.length === 0) continue;

        const newFolderUuid = uuidMaps.folders.get(originalFolder.uuid);
        expect(newFolderUuid).toBeDefined();

        const duplicatedFolder = await em.findOne(Folder_db, { uuid: newFolderUuid });
        expect(duplicatedFolder).toBeDefined();
        if (!duplicatedFolder || !duplicatedFolder.items) continue;

        switch (originalFolder.type) {
          // Automerge-backed entities: item uuids are preserved 1:1
          case "poi":
          case "station":
          case "eva":
            expect(duplicatedFolder.items).toEqual(originalFolder.items);
            break;

          // DB-backed entities: item uuids get remapped to the new entity uuids
          case "preset":
            for (const originalPresetUuid of originalFolder.items) {
              const newPresetUuid = uuidMaps.presets.get(originalPresetUuid);
              if (newPresetUuid) {
                expect(duplicatedFolder.items).toContain(newPresetUuid);
              }
            }
            break;
          case "layer":
            for (const originalLayerUuid of originalFolder.items) {
              const newLayerUuid = uuidMaps.layers.get(originalLayerUuid);
              if (newLayerUuid) {
                expect(duplicatedFolder.items).toContain(newLayerUuid);
              }
            }
            break;
        }
      }
    });
  });

  // Additional test sections would go here for other entity types

  describe("Original Mission Integrity Check", () => {
    test("Should ensure original mission data remains unchanged after duplication", async () => {
      // Fetch the current state of the original mission
      const currentOriginalMissionData = await getAll(testMission.id);

      // Compare the current state with the state before duplication
      // Using lodash.isEqual for a deep comparison
      const areEqual = isEqual(currentOriginalMissionData, originalFullStore);
      expect(areEqual).toBe(true);
    });
  });

  afterAll(async () => {
    const em = globalValues.orm.em.fork();

    // Delete the duplicated mission and all its related entities
    if (duplicatedMissionId) {
      await deleteAutomergeMissions([duplicatedMissionId]);
    }

    // Delete the test user
    await em.nativeDelete(App_User_db, { id: testAppUser.id });

    // Delete the original test mission, its doc listing, and all related entities
    if (testMission?.id) {
      await deleteAutomergeMissions([testMission.id]);
    }

    // Close the ORM connection
    await globalValues.orm.close();
    globalValues.orm = null;
  });
});
