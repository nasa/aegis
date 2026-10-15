import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import { App_User_db, Doc_Listing_db } from "server/database/models/_allModels";
import { fetchMissionSourceData, createMissionCopy } from "server/express/routes/missionDup";
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

// Entity collections, compared in their own tests below
const MISSION_ID_COLLECTIONS = [
  "pois",
  "actions",
  "stations",
  "traverses",
  "evas",
  "rexes",
  "folders",
  "layers",
  "sublayers",
  "presets",
  "stmLevel1s",
  "stmRules",
];

// What properties to exclude in comparisons for each entity type
const CHANGING_PROPS = {
  mission: ["id", "uuid", "createdAt", "updatedAt", "name", "version", ...MISSION_ID_COLLECTIONS],
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

      // Create a duplicate mission
      duplicatedMissionId = await createMissionCopy(sourceData, {
        nameSuffix: "Vitest Test Copy",
        copyAssets: false, // We're just testing the document copy, not file operations
      });

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

  // Additional test sections would go here for other entity types

  // Layers, sublayers, presets, STM, and folders live on the mission doc and are copied 1:1
  // with their uuids, so every cross-reference between them stays valid.
  describe("Mission Doc Collection Duplication", () => {
    const collections = [
      "layers",
      "sublayers",
      "presets",
      "stmLevel1s",
      "stmLevel2s",
      "stmLevel3s",
      "stmRules",
      "folders",
    ] as const;

    test.each(collections)("%s are copied with the same uuids", async (collection) => {
      const original = sourceData.mission[collection];
      expect(Object.keys(original).length).toBeGreaterThan(0);
      const duplicated = (await getDuplicatedMission())[collection];
      expect(Object.keys(duplicated).sort()).toEqual(Object.keys(original).sort());
    });

    test("Preset sublayer controls and layer order still reference the copied layers", async () => {
      const duplicatedMission = await getDuplicatedMission();
      for (const preset of Object.values(duplicatedMission.presets)) {
        for (const sublayerUuid of Object.keys(preset.mapSublayerControls)) {
          expect(duplicatedMission.sublayers[sublayerUuid]).toBeDefined();
        }
        for (const entry of preset.layerOrder) {
          expect(duplicatedMission.layers[entry.layerUuid]).toBeDefined();
        }
      }
    });

    test("STM rules and action STM priorities still reference the copied level 3 items", async () => {
      const duplicatedMission = await getDuplicatedMission();
      for (const rule of Object.values(duplicatedMission.stmRules)) {
        expect(duplicatedMission.stmLevel3s[rule.stmUuid]).toBeDefined();
      }
      for (const action of Object.values(duplicatedMission.actions)) {
        for (const stmUuid of Object.keys(action.stmPriorities ?? {})) {
          expect(duplicatedMission.stmLevel3s[stmUuid]).toBeDefined();
        }
      }
    });

    test("Folder items are preserved verbatim", async () => {
      const duplicatedMission = await getDuplicatedMission();
      for (const [uuid, folder] of Object.entries(sourceData.mission.folders)) {
        expect(duplicatedMission.folders[uuid].items).toEqual(folder.items);
      }
    });
  });

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
