import { describe, expect, test, afterAll, beforeAll } from "@jest/globals";
import { MikroORM } from "@mikro-orm/postgresql";
import config from "server/database/mikro-orm.config";
import { globalValues } from "server/express/global";
import {
  Mission_db,
  App_User_db,
  Station_db,
  Poi_db,
  Action_db,
  Eva_db,
  Layer_db,
  Sublayer_db,
  Traverse_db,
  Preset_db,
  Rex_db,
  STM_Level1_db,
  STM_Level2_db,
  STM_Level3_db,
  STM_Rule_db,
  Grid_db,
  Folder_db,
} from "server/database/models/_allModels";
import { fetchMissionEntities, createMissionCopy } from "utils/dup/core";
import { initializeUuidMaps } from "utils/dup/helpers";
import AppUserFactory from "../factories/AppUserFactory";
import { deleteMissions } from "server/express/routes/mission";
import { v4 as uuidv4 } from "uuid"; // Import uuidv4
import { getAll } from "../../../server/express/routes/all";
import isEqual from "lodash/isEqual";

// These global variables will store our test data
let testAppUser: App_User_db;
let testMission: Mission_db;
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
  mission: ["id", "uuid", "createdAt", "updatedAt", "name", "activeGridUuid", "version"],
  station: ["uuid", "mission", "createdAt", "updatedAt", "actionOrderUuids", "poi", "version"],
  poi: ["uuid", "mission", "createdAt", "updatedAt", "actionOrderUuids", "station", "version"],
  action: [
    "uuid",
    "mission",
    "createdAt",
    "updatedAt",
    "poi",
    "station",
    "traverse",
    "parentAction",
    "version",
  ],
  stmLevel1: ["uuid", "mission", "createdAt", "updatedAt", "level2s", "version"],
  stmLevel2: ["uuid", "level1", "createdAt", "updatedAt", "level3s", "version"],
  stmLevel3: ["uuid", "level2", "createdAt", "updatedAt", "version"],
  // Add more entity types as needed
};

let originalFullStore: OneMissionToRuleThemAll;

describe("Mission Duplication Tests", () => {
  beforeAll(async () => {
    // Initialize MikroORM and set it in globalValues
    // Enable allowGlobalContext for this test specifically to allow using the global EM instance.
    // This is required because this test calls getAll(), which internally calls route functions
    // like getActions(), getEVAs(), etc. These route functions use globalValues.orm.em directly
    // (without forking) because in production they are called within Express request handlers
    // where the request context is already established.
    globalValues.orm = await MikroORM.init({ ...config, allowGlobalContext: true });
    const em = globalValues.orm.em.fork();

    // Get mission with ID 22 from the database instead of creating a new one.
    // 22 is our boilerplate test mission that only superusers can access
    testMission = await em.findOne(Mission_db, { id: 22 });
    if (!testMission) {
      throw new Error(
        "Mission with ID 22 not found in the database. Please ensure it exists before running this test."
      );
    }

    // Create a test grid for mission 22
    const testGridUuid = uuidv4();
    const testGrid = em.create(Grid_db, {
      uuid: testGridUuid,
      mission: testMission,
      name: "Test Grid",
      numRows: 10,
      numCols: 10,
      spacing: 100,
      isActiveGrid: true,
    });
    em.persist(testGrid);

    // Update the mission to reference the new grid as active
    testMission.activeGridUuid = testGridUuid;
    em.persist(testMission);

    // Flush changes to ensure grid and mission update are saved before fetching
    await em.flush();

    // Create a test user with permissions for mission 22
    testAppUser = await new AppUserFactory(em).createOne({
      username: "JestMissionUtils",
      permissionList: [
        {
          missionId: testMission.id,
          permissions: {
            edit: true,
            view: true,
          },
        },
      ],
    });

    // Initialize UUID maps to track the mapping between original and duplicate entities
    uuidMaps = initializeUuidMaps();

    // Fetch source mission data from mission 22 (now includes the grid)
    sourceData = await fetchMissionEntities(em, testMission.id);

    // Populate originalFullStore with the state of the mission before duplication
    originalFullStore = await getAll(testMission.id);
  });

  describe("Mission Table Duplication", () => {
    test("Should duplicate a mission record", async () => {
      const em = globalValues.orm.em.fork();

      // Create a duplicate mission and capture the UUID mappings by passing our UUID maps
      duplicatedMissionId = await createMissionCopy(
        em,
        sourceData,
        {
          nameSuffix: "Jest Test Copy",
          copyAssets: false, // We're just testing database operations, not file operations
        },
        uuidMaps // Pass our UUID maps to be populated during duplication
      );

      // Verify the duplicated mission exists
      expect(duplicatedMissionId).toBeDefined();
      expect(duplicatedMissionId).not.toEqual(testMission.id);

      // Fetch the duplicated mission
      const duplicatedMission = await em.findOne(Mission_db, {
        id: duplicatedMissionId,
      });

      // Check the duplicated mission properties
      expect(duplicatedMission).not.toBeNull();
      expect(duplicatedMission?.name).toEqual(`${testMission.name} - Jest Test Copy`);

      // Compare relevant properties excluding ones we expect to be different
      const originalMissionProps = omitChangingProps(sourceData.mission, CHANGING_PROPS.mission);
      const duplicatedMissionProps = duplicatedMission
        ? omitChangingProps(duplicatedMission, CHANGING_PROPS.mission)
        : {};

      expect(duplicatedMissionProps).toEqual(originalMissionProps);
    });
  });

  describe("Station Duplication", () => {
    test("Should duplicate all stations with proper relationships", async () => {
      const em = globalValues.orm.em.fork();

      // 1. Get all stations from the original mission
      const originalStations = sourceData.stations;
      expect(originalStations.length).toBeGreaterThan(0);

      // 2. Get all stations from the duplicated mission
      const duplicatedStations = await em.find(Station_db, {
        mission: { id: duplicatedMissionId },
      });
      expect(duplicatedStations.length).toEqual(originalStations.length);

      // 3. Verify stations were correctly duplicated
      for (const originalStation of originalStations) {
        // Get the mapped UUID
        const newUuid = uuidMaps.stations.get(originalStation.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated station with this UUID
        const duplicatedStation = duplicatedStations.find((s) => s.uuid === newUuid);
        expect(duplicatedStation).toBeDefined();

        // Verify the properties were duplicated correctly (excluding changing properties)
        if (duplicatedStation) {
          // Compare station name (should be identical)
          expect(duplicatedStation.name).toEqual(originalStation.name);

          // Verify the mission ID was updated
          expect(duplicatedStation.mission.id).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalStationSimple = safeSerialize(originalStation);
          const duplicatedStationSimple = safeSerialize(duplicatedStation);

          // Remove the properties we expect to be different
          const filteredOriginal = omitChangingProps(originalStationSimple, CHANGING_PROPS.station);
          const filteredDuplicated = omitChangingProps(
            duplicatedStationSimple,
            CHANGING_PROPS.station
          );

          expect(filteredDuplicated).toEqual(filteredOriginal);
        }
      }
    });

    test("Should update action order UUIDs in stations", async () => {
      const em = globalValues.orm.em.fork();

      // Get stations with action order UUIDs
      const stationsWithActions = sourceData.stations.filter(
        (station: Station_db) => station.actionOrderUuids && station.actionOrderUuids.length > 0
      );

      // Skip if no stations have action order UUIDs
      if (stationsWithActions.length === 0) {
        console.warn("No stations with action order UUIDs to test");
        return;
      }

      for (const originalStation of stationsWithActions) {
        // Get the mapped UUID
        const newStationUuid = uuidMaps.stations.get(originalStation.uuid);
        expect(newStationUuid).toBeDefined();

        // Get the duplicated station
        const duplicatedStation = await em.findOne(Station_db, { uuid: newStationUuid });
        expect(duplicatedStation).toBeDefined();

        if (
          !duplicatedStation ||
          !duplicatedStation.actionOrderUuids ||
          !originalStation.actionOrderUuids
        ) {
          continue;
        }

        // Verify the action order UUIDs array length matches
        expect(duplicatedStation.actionOrderUuids.length).toEqual(
          originalStation.actionOrderUuids.length
        );

        // Verify each action UUID was correctly mapped using our UUID mapping
        for (let i = 0; i < originalStation.actionOrderUuids.length; i++) {
          const originalActionUuid = originalStation.actionOrderUuids[i];
          const expectedNewActionUuid = uuidMaps.actions.get(originalActionUuid);

          if (expectedNewActionUuid) {
            // If the action was found in the map, verify it was used in the duplicated station
            const actualNewActionUuid = duplicatedStation.actionOrderUuids[i];
            expect(actualNewActionUuid).toEqual(expectedNewActionUuid);
          } else {
            console.warn(`Action UUID ${originalActionUuid} not found in UUID map`);
          }
        }
      }
    });
  });

  describe("POI Duplication", () => {
    test("Should duplicate all POIs with proper relationships", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no POIs to test
      if (sourceData.pois.length === 0) {
        console.warn("No POIs to test in the source mission");
        return;
      }

      // 1. Get all POIs from the original mission
      const originalPois = sourceData.pois;

      // 2. Get all POIs from the duplicated mission
      const duplicatedPois = await em.find(Poi_db, { mission: { id: duplicatedMissionId } });
      expect(duplicatedPois.length).toEqual(originalPois.length);

      // 3. Verify POIs were correctly duplicated
      for (const originalPoi of originalPois) {
        // Get the mapped UUID
        const newUuid = uuidMaps.pois.get(originalPoi.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated POI with this UUID
        const duplicatedPoi = duplicatedPois.find((p) => p.uuid === newUuid);
        expect(duplicatedPoi).toBeDefined();

        // Verify the properties were duplicated correctly (excluding changing properties)
        if (duplicatedPoi) {
          // Compare POI name (should be identical)
          expect(duplicatedPoi.name).toEqual(originalPoi.name);

          // Verify the mission ID was updated
          expect(duplicatedPoi.mission.id).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalPoiSimple = safeSerialize(originalPoi);
          const duplicatedPoiSimple = safeSerialize(duplicatedPoi);

          // Remove the properties we expect to be different
          const filteredOriginal = omitChangingProps(originalPoiSimple, CHANGING_PROPS.poi);
          const filteredDuplicated = omitChangingProps(duplicatedPoiSimple, CHANGING_PROPS.poi);

          expect(filteredDuplicated).toEqual(filteredOriginal);
        }
      }
    });

    test("Should maintain relationships between POIs and stations", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no POIs to test
      if (sourceData.pois.length === 0) {
        console.warn("No POIs to test in the source mission");
        return;
      }

      // For each original POI with station relationships
      for (const originalPoi of sourceData.pois) {
        // If the POI has associated stations
        if (
          originalPoi.station &&
          typeof originalPoi.station === "object" &&
          typeof originalPoi.station.isInitialized === "function" &&
          originalPoi.station.isInitialized()
        ) {
          // Get the stations associated with the original POI
          const originalStations = originalPoi.station.getItems();

          // Get the duplicated POI
          const newPoiUuid = uuidMaps.pois.get(originalPoi.uuid);
          if (!newPoiUuid) continue;

          const duplicatedPoi = await em.findOne(
            Poi_db,
            { uuid: newPoiUuid },
            { populate: ["station"] }
          );
          expect(duplicatedPoi).toBeDefined();

          if (!duplicatedPoi) continue;

          // Ensure the station collection is initialized
          if (
            duplicatedPoi.station &&
            typeof duplicatedPoi.station === "object" &&
            typeof duplicatedPoi.station.isInitialized === "function"
          ) {
            const duplicatedStations = duplicatedPoi.station.isInitialized()
              ? duplicatedPoi.station.getItems()
              : [];

            // Verify the duplicated POI has the same number of stations
            expect(duplicatedStations.length).toEqual(originalStations.length);

            // Verify each station relationship was properly duplicated
            for (const originalStation of originalStations) {
              const newStationUuid = uuidMaps.stations.get(originalStation.uuid);
              expect(newStationUuid).toBeDefined();

              // Check if the duplicated POI has a relationship with the duplicated station
              const hasRelationship = duplicatedStations.some((s) => s.uuid === newStationUuid);
              expect(hasRelationship).toBeTruthy();
            }
          }
        }
      }
    });

    test("Should update action order UUIDs in POIs", async () => {
      const em = globalValues.orm.em.fork();

      // Get POIs with action order UUIDs
      const poisWithActions = sourceData.pois.filter(
        (poi: Poi_db) => poi.actionOrderUuids && poi.actionOrderUuids.length > 0
      );

      // Skip if no POIs have action order UUIDs
      if (poisWithActions.length === 0) {
        console.warn("No POIs with action order UUIDs to test");
        return;
      }

      for (const originalPoi of poisWithActions) {
        // Get the mapped UUID
        const newPoiUuid = uuidMaps.pois.get(originalPoi.uuid);
        expect(newPoiUuid).toBeDefined();

        // Get the duplicated POI
        const duplicatedPoi = await em.findOne(Poi_db, { uuid: newPoiUuid });
        expect(duplicatedPoi).toBeDefined();

        if (!duplicatedPoi || !duplicatedPoi.actionOrderUuids || !originalPoi.actionOrderUuids) {
          continue;
        }

        // Verify the action order UUIDs array length matches
        expect(duplicatedPoi.actionOrderUuids.length).toEqual(originalPoi.actionOrderUuids.length);

        // Verify each action UUID was correctly mapped using our UUID mapping
        for (let i = 0; i < originalPoi.actionOrderUuids.length; i++) {
          const originalActionUuid = originalPoi.actionOrderUuids[i];
          const expectedNewActionUuid = uuidMaps.actions.get(originalActionUuid);

          if (expectedNewActionUuid) {
            // If the action was found in the map, verify it was used in the duplicated POI
            const actualNewActionUuid = duplicatedPoi.actionOrderUuids[i];
            expect(actualNewActionUuid).toEqual(expectedNewActionUuid);
          } else {
            console.warn(`Action UUID ${originalActionUuid} not found in UUID map`);
          }
        }
      }
    });
  });

  describe("Action Duplication", () => {
    test("Should duplicate all actions with proper relationships", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no actions to test
      if (sourceData.actions.length === 0) {
        console.warn("No actions to test in the source mission");
        return;
      }

      // 1. Get all actions from the original mission
      const originalActions = sourceData.actions;

      // 2. Get all actions from the duplicated mission
      const duplicatedActions = await em.find(Action_db, { mission: { id: duplicatedMissionId } });
      expect(duplicatedActions.length).toEqual(originalActions.length);

      // 3. Verify actions were correctly duplicated
      for (const originalAction of originalActions) {
        // Get the mapped UUID
        const newUuid = uuidMaps.actions.get(originalAction.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated action with this UUID
        const duplicatedAction = duplicatedActions.find((a) => a.uuid === newUuid);
        expect(duplicatedAction).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedAction) {
          // Compare action name (should be identical)
          expect(duplicatedAction.name).toEqual(originalAction.name);

          // Verify the mission ID was updated
          expect(duplicatedAction.mission.id).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalActionSimple = safeSerialize(originalAction);
          const duplicatedActionSimple = safeSerialize(duplicatedAction);

          // Remove the properties we expect to be different
          const filteredOriginal = omitChangingProps(originalActionSimple, CHANGING_PROPS.action);
          const filteredDuplicated = omitChangingProps(
            duplicatedActionSimple,
            CHANGING_PROPS.action
          );

          expect(filteredDuplicated).toEqual(filteredOriginal);
        }
      }
    });

    test("Should maintain parent-child relationships between actions", async () => {
      const em = globalValues.orm.em.fork();

      // Find actions that have parent-child relationships
      const actionsWithParents = sourceData.actions.filter(
        (action: Action_db) => action.parentAction?.uuid
      );

      // Skip if no actions have parent-child relationships
      if (actionsWithParents.length === 0) {
        console.warn("No actions with parent-child relationships to test");
        return;
      }

      for (const originalChildAction of actionsWithParents) {
        // Get the parent action UUID
        const originalParentUuid = originalChildAction.parentAction.uuid;

        // Get the mapped UUIDs
        const newChildUuid = uuidMaps.actions.get(originalChildAction.uuid);
        const newParentUuid = uuidMaps.actions.get(originalParentUuid);

        expect(newChildUuid).toBeDefined();
        expect(newParentUuid).toBeDefined();

        // Get the duplicated child action
        const duplicatedChildAction = await em.findOne(
          Action_db,
          { uuid: newChildUuid },
          { populate: ["parentAction"] }
        );

        expect(duplicatedChildAction).toBeDefined();
        expect(duplicatedChildAction?.parentAction).toBeDefined();

        // Verify the parent-child relationship was maintained
        if (duplicatedChildAction && duplicatedChildAction.parentAction) {
          expect(duplicatedChildAction.parentAction.uuid).toEqual(newParentUuid);
        }
      }
    });

    test("Should maintain action-station relationships", async () => {
      const em = globalValues.orm.em.fork();

      // Find actions that have station relationships
      const actionsWithStations = sourceData.actions.filter(
        (action: Action_db) => action.station?.uuid
      );

      // Skip if no actions have station relationships
      if (actionsWithStations.length === 0) {
        console.warn("No actions with station relationships to test");
        return;
      }

      for (const originalAction of actionsWithStations) {
        // Get the station UUID
        const originalStationUuid = originalAction.station.uuid;

        // Get the mapped UUIDs
        const newActionUuid = uuidMaps.actions.get(originalAction.uuid);
        const newStationUuid = uuidMaps.stations.get(originalStationUuid);

        expect(newActionUuid).toBeDefined();
        expect(newStationUuid).toBeDefined();

        // Get the duplicated action
        const duplicatedAction = await em.findOne(
          Action_db,
          { uuid: newActionUuid },
          { populate: ["station"] }
        );

        expect(duplicatedAction).toBeDefined();
        expect(duplicatedAction?.station).toBeDefined();

        // Verify the action-station relationship was maintained
        if (duplicatedAction && duplicatedAction.station) {
          expect(duplicatedAction.station.uuid).toEqual(newStationUuid);
        }
      }
    });

    test("Should maintain action-POI relationships", async () => {
      const em = globalValues.orm.em.fork();

      // Find actions that have POI relationships
      const actionsWithPois = sourceData.actions.filter((action: Action_db) => action.poi?.uuid);

      // Skip if no actions have POI relationships
      if (actionsWithPois.length === 0) {
        console.warn("No actions with POI relationships to test");
        return;
      }

      for (const originalAction of actionsWithPois) {
        // Get the POI UUID
        const originalPoiUuid = originalAction.poi.uuid;

        // Get the mapped UUIDs
        const newActionUuid = uuidMaps.actions.get(originalAction.uuid);
        const newPoiUuid = uuidMaps.pois.get(originalPoiUuid);

        expect(newActionUuid).toBeDefined();
        expect(newPoiUuid).toBeDefined();

        // Get the duplicated action
        const duplicatedAction = await em.findOne(
          Action_db,
          { uuid: newActionUuid },
          { populate: ["poi"] }
        );

        expect(duplicatedAction).toBeDefined();
        expect(duplicatedAction?.poi).toBeDefined();

        // Verify the action-POI relationship was maintained
        if (duplicatedAction && duplicatedAction.poi) {
          expect(duplicatedAction.poi.uuid).toEqual(newPoiUuid);
        }
      }
    });

    test("Should maintain action-traverse relationships", async () => {
      const em = globalValues.orm.em.fork();

      // Find actions that have traverse relationships
      const actionsWithTraverses = sourceData.actions.filter(
        (action: Action_db) => action.traverse?.uuid
      );

      // Skip if no actions have traverse relationships
      if (actionsWithTraverses.length === 0) {
        console.warn("No actions with traverse relationships to test");
        return;
      }

      for (const originalAction of actionsWithTraverses) {
        // Get the traverse UUID
        const originalTraverseUuid = originalAction.traverse.uuid;

        // Get the mapped UUIDs
        const newActionUuid = uuidMaps.actions.get(originalAction.uuid);
        const newTraverseUuid = uuidMaps.traverses.get(originalTraverseUuid);

        expect(newActionUuid).toBeDefined();
        expect(newTraverseUuid).toBeDefined();

        // Get the duplicated action
        const duplicatedAction = await em.findOne(
          Action_db,
          { uuid: newActionUuid },
          { populate: ["traverse"] }
        );

        expect(duplicatedAction).toBeDefined();
        expect(duplicatedAction?.traverse).toBeDefined();

        // Verify the action-traverse relationship was maintained
        if (duplicatedAction && duplicatedAction.traverse) {
          expect(duplicatedAction.traverse.uuid).toEqual(newTraverseUuid);
        }
      }
    });
  });

  describe("Traverse Duplication", () => {
    test("Should duplicate all traverses with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no traverses to test
      if (sourceData.traverses.length === 0) {
        console.warn("No traverses to test in the source mission");
        return;
      }

      // 1. Get all traverses from the original mission
      const originalTraverses = sourceData.traverses;

      // 2. Get all traverses from the duplicated mission
      const duplicatedTraverses = await em.find(Traverse_db, {
        mission: { id: duplicatedMissionId },
      });
      expect(duplicatedTraverses.length).toEqual(originalTraverses.length);

      // 3. Verify traverses were correctly duplicated
      for (const originalTraverse of originalTraverses) {
        // Get the mapped UUID
        const newUuid = uuidMaps.traverses.get(originalTraverse.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated traverse with this UUID
        const duplicatedTraverse = duplicatedTraverses.find((t) => t.uuid === newUuid);
        expect(duplicatedTraverse).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedTraverse) {
          // Compare traverse name (should be identical)
          expect(duplicatedTraverse.name).toEqual(originalTraverse.name);

          // Verify the mission ID was updated
          expect(duplicatedTraverse.mission.id).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalTraverseSimple = safeSerialize(originalTraverse);
          const duplicatedTraverseSimple = safeSerialize(duplicatedTraverse);

          // Compare relevant properties
          expect(duplicatedTraverseSimple.name).toEqual(originalTraverseSimple.name);
          expect(duplicatedTraverseSimple.description).toEqual(originalTraverseSimple.description);
          expect(duplicatedTraverseSimple.status).toEqual(originalTraverseSimple.status);
          expect(duplicatedTraverseSimple.color).toEqual(originalTraverseSimple.color);

          // Compare path coordinates (if they exist)
          if (originalTraverse.path && originalTraverse.path.length > 0) {
            expect(duplicatedTraverse.path).toEqual(originalTraverse.path);
          }
        }
      }
    });

    test("Should update action order UUIDs in traverses", async () => {
      const em = globalValues.orm.em.fork();

      // Get traverses with action order UUIDs
      const traversesWithActions = sourceData.traverses.filter(
        (traverse) => traverse.actionOrderUuids && traverse.actionOrderUuids.length > 0
      );

      // Skip if no traverses have action order UUIDs
      if (traversesWithActions.length === 0) {
        console.warn("No traverses with action order UUIDs to test");
        return;
      }

      for (const originalTraverse of traversesWithActions) {
        // Get the mapped UUID
        const newTraverseUuid = uuidMaps.traverses.get(originalTraverse.uuid);
        expect(newTraverseUuid).toBeDefined();

        // Get the duplicated traverse
        const duplicatedTraverse = await em.findOne(Traverse_db, { uuid: newTraverseUuid });
        expect(duplicatedTraverse).toBeDefined();

        if (
          !duplicatedTraverse ||
          !duplicatedTraverse.actionOrderUuids ||
          !originalTraverse.actionOrderUuids
        ) {
          continue;
        }

        // Verify the action order UUIDs array length matches
        expect(duplicatedTraverse.actionOrderUuids.length).toEqual(
          originalTraverse.actionOrderUuids.length
        );

        // Verify each action UUID was correctly mapped using our UUID mapping
        for (let i = 0; i < originalTraverse.actionOrderUuids.length; i++) {
          const originalActionUuid = originalTraverse.actionOrderUuids[i];
          const expectedNewActionUuid = uuidMaps.actions.get(originalActionUuid);

          if (expectedNewActionUuid) {
            // If the action was found in the map, verify it was used in the duplicated traverse
            const actualNewActionUuid = duplicatedTraverse.actionOrderUuids[i];
            expect(actualNewActionUuid).toEqual(expectedNewActionUuid);
          } else {
            console.warn(`Action UUID ${originalActionUuid} not found in UUID map`);
          }
        }
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
      const duplicatedLayers = await em.find(Layer_db, { mission: { id: duplicatedMissionId } });
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
          expect(duplicatedLayer.mission.id).toEqual(duplicatedMissionId);
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
        mission: { id: duplicatedMissionId },
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
          expect(duplicatedSublayer.mission.id).toEqual(duplicatedMissionId);

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
    test("Should duplicate all EVAs with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no EVAs to test
      if (sourceData.evas.length === 0) {
        console.warn("No EVAs to test in the source mission");
        return;
      }

      // 1. Get all EVAs from the original mission
      const originalEvas = sourceData.evas;

      // 2. Get all EVAs from the duplicated mission
      const duplicatedEvas = await em.find(Eva_db, { mission: { id: duplicatedMissionId } });
      expect(duplicatedEvas.length).toEqual(originalEvas.length);

      // 3. Verify EVAs were correctly duplicated
      for (const originalEva of originalEvas) {
        // Get the mapped UUID
        const newUuid = uuidMaps.evas.get(originalEva.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated EVA with this UUID
        const duplicatedEva = duplicatedEvas.find((e) => e.uuid === newUuid);
        expect(duplicatedEva).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedEva) {
          // Compare EVA name (should be identical)
          expect(duplicatedEva.name).toEqual(originalEva.name);

          // Verify the mission ID was updated
          expect(duplicatedEva.mission.id).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalEvaSimple = safeSerialize(originalEva);
          const duplicatedEvaSimple = safeSerialize(duplicatedEva);

          // Compare relevant properties
          expect(duplicatedEvaSimple.name).toEqual(originalEvaSimple.name);
          expect(duplicatedEvaSimple.description).toEqual(originalEvaSimple.description);
          expect(duplicatedEvaSimple.status).toEqual(originalEvaSimple.status);
        }
      }
    });

    test("Should update station and traverse references in EVA sequences", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no EVAs to test
      if (sourceData.evas.length === 0) {
        console.warn("No EVAs to test in the source mission");
        return;
      }

      // For each EVA with a sequence
      for (const originalEva of sourceData.evas) {
        if (!originalEva.sequence || originalEva.sequence.length === 0) {
          continue;
        }

        // Get the mapped EVA UUID
        const newEvaUuid = uuidMaps.evas.get(originalEva.uuid);
        expect(newEvaUuid).toBeDefined();

        // Get the duplicated EVA
        const duplicatedEva = await em.findOne(Eva_db, { uuid: newEvaUuid });
        expect(duplicatedEva).toBeDefined();

        if (!duplicatedEva || !duplicatedEva.sequence) {
          continue;
        }

        // Verify the sequence length matches
        expect(duplicatedEva.sequence.length).toEqual(originalEva.sequence.length);

        // Check each sequence item
        for (let i = 0; i < originalEva.sequence.length; i++) {
          const originalItem = originalEva.sequence[i];
          const duplicatedItem = duplicatedEva.sequence[i];

          // Type should match
          expect(duplicatedItem.type).toEqual(originalItem.type);

          // UUID should be updated based on the item type
          if (originalItem.type === "station" && originalItem.uuid) {
            const expectedNewUuid = uuidMaps.stations.get(originalItem.uuid);
            // Only check non-empty UUIDs that have mappings
            if (expectedNewUuid) {
              expect(duplicatedItem.uuid).toEqual(expectedNewUuid);
            }
          } else if (originalItem.type === "traverse" && originalItem.uuid) {
            const expectedNewUuid = uuidMaps.traverses.get(originalItem.uuid);
            // Only check non-empty UUIDs that have mappings
            if (expectedNewUuid) {
              expect(duplicatedItem.uuid).toEqual(expectedNewUuid);
            }
          }
        }
      }
    });

    test("Should update egress and ingress location references in EVAs", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no EVAs to test
      if (sourceData.evas.length === 0) {
        console.warn("No EVAs to test in the source mission");
        return;
      }

      // For each EVA with egress/ingress locations
      for (const originalEva of sourceData.evas) {
        // Get the mapped EVA UUID
        const newEvaUuid = uuidMaps.evas.get(originalEva.uuid);
        expect(newEvaUuid).toBeDefined();

        // Get the duplicated EVA
        const duplicatedEva = await em.findOne(Eva_db, { uuid: newEvaUuid });
        expect(duplicatedEva).toBeDefined();

        if (!duplicatedEva) continue;

        // Check egress location UUID
        if (originalEva.egressLocationUuid && originalEva.egressLocationUuid !== "lander") {
          const expectedNewEgressUuid = uuidMaps.stations.get(originalEva.egressLocationUuid);
          expect(duplicatedEva.egressLocationUuid).toEqual(expectedNewEgressUuid);
        } else if (originalEva.egressLocationUuid === "lander") {
          // If it's the lander, it should remain as 'lander'
          expect(duplicatedEva.egressLocationUuid).toEqual("lander");
        }

        // Check ingress location UUID
        if (originalEva.ingressLocationUuid && originalEva.ingressLocationUuid !== "lander") {
          const expectedNewIngressUuid = uuidMaps.stations.get(originalEva.ingressLocationUuid);
          expect(duplicatedEva.ingressLocationUuid).toEqual(expectedNewIngressUuid);
        } else if (originalEva.ingressLocationUuid === "lander") {
          // If it's the lander, it should remain as 'lander'
          expect(duplicatedEva.ingressLocationUuid).toEqual("lander");
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
        mission: { id: duplicatedMissionId },
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
          expect(duplicatedStm.mission.id).toEqual(duplicatedMissionId);
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
        { mission: { id: duplicatedMissionId } },
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
        { mission: { id: duplicatedMissionId } },
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
            const hasChild = duplicatedLevel2s.some((l2) => l2.uuid === newLevel2Uuid);
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
            const hasChild = duplicatedLevel3s.some((l3) => l3.uuid === newLevel3Uuid);
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
        mission: { id: duplicatedMissionId },
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
          expect(duplicatedRule.mission.id).toEqual(duplicatedMissionId);

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
      const duplicatedPresets = await em.find(Preset_db, { mission: { id: duplicatedMissionId } });
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
          expect(duplicatedPreset.mission.id).toEqual(duplicatedMissionId);

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
    test("Should duplicate all REX entities with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no REXes to test
      if (sourceData.rexes.length === 0) {
        console.warn("No REX entities to test in the source mission");
        return;
      }

      // 1. Get all REXes from the original mission
      const originalRexes = sourceData.rexes;

      // 2. Get all REXes from the duplicated mission
      const duplicatedRexes = await em.find(Rex_db, { mission: { id: duplicatedMissionId } });
      expect(duplicatedRexes.length).toEqual(originalRexes.length);

      // 3. Verify REXes were correctly duplicated
      for (const originalRex of originalRexes) {
        // Get the mapped UUID
        const newUuid = uuidMaps.rexes.get(originalRex.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated REX with this UUID
        const duplicatedRex = duplicatedRexes.find((r) => r.uuid === newUuid);
        expect(duplicatedRex).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedRex) {
          // Compare REX name (should be identical)
          expect(duplicatedRex.name).toEqual(originalRex.name);

          // Verify the mission ID was updated
          expect(duplicatedRex.mission.id).toEqual(duplicatedMissionId);

          // Use the safe serialization approach to compare only simple properties
          const originalRexSimple = safeSerialize(originalRex);
          const duplicatedRexSimple = safeSerialize(duplicatedRex);

          // Compare relevant properties
          expect(duplicatedRexSimple.name).toEqual(originalRexSimple.name);
          expect(duplicatedRexSimple.description).toEqual(originalRexSimple.description);

          // If the REX is linked to an EVA, verify the EVA UUID was updated
          if (originalRex.evaUuid) {
            const newEvaUuid = uuidMaps.evas.get(originalRex.evaUuid);
            expect(duplicatedRex.evaUuid).toEqual(newEvaUuid);
          }
        }
      }
    });

    test("Should update entity references in REX entries", async () => {
      const em = globalValues.orm.em.fork();

      // Get REXes that have station entries
      const rexesWithStationEntries = sourceData.rexes.filter(
        (rex) => rex.stationEntries && Object.keys(rex.stationEntries).length > 0
      );

      // Skip if no REXes have station entries
      if (rexesWithStationEntries.length === 0) {
        console.warn("No REXes with station entries to test");
        return;
      }

      for (const originalRex of rexesWithStationEntries) {
        // Get the mapped UUID
        const newRexUuid = uuidMaps.rexes.get(originalRex.uuid);
        expect(newRexUuid).toBeDefined();

        // Get the duplicated REX
        const duplicatedRex = await em.findOne(Rex_db, { uuid: newRexUuid });
        expect(duplicatedRex).toBeDefined();

        if (!duplicatedRex || !duplicatedRex.stationEntries) continue;

        // For each station UUID in the original entries
        for (const originalStationUuid of Object.keys(originalRex.stationEntries)) {
          // Get the mapped station UUID
          const newStationUuid = uuidMaps.stations.get(originalStationUuid);

          // If we have a mapping for this station UUID
          if (newStationUuid) {
            // Check that the duplicated entries contain an entry for the new station UUID
            expect(duplicatedRex.stationEntries[newStationUuid]).toBeDefined();
          }
        }
      }

      // Do similar checks for traverse entries if they exist
      const rexesWithTraverseEntries = sourceData.rexes.filter(
        (rex) => rex.traverseEntries && Object.keys(rex.traverseEntries).length > 0
      );

      if (rexesWithTraverseEntries.length > 0) {
        for (const originalRex of rexesWithTraverseEntries) {
          const newRexUuid = uuidMaps.rexes.get(originalRex.uuid);
          const duplicatedRex = await em.findOne(Rex_db, { uuid: newRexUuid });

          if (!duplicatedRex || !duplicatedRex.traverseEntries) continue;

          for (const originalTraverseUuid of Object.keys(originalRex.traverseEntries)) {
            const newTraverseUuid = uuidMaps.traverses.get(originalTraverseUuid);

            if (newTraverseUuid) {
              expect(duplicatedRex.traverseEntries[newTraverseUuid]).toBeDefined();
            }
          }
        }
      }

      // Check action entries
      const rexesWithActionEntries = sourceData.rexes.filter(
        (rex) => rex.actionEntries && Object.keys(rex.actionEntries).length > 0
      );

      if (rexesWithActionEntries.length > 0) {
        for (const originalRex of rexesWithActionEntries) {
          const newRexUuid = uuidMaps.rexes.get(originalRex.uuid);
          const duplicatedRex = await em.findOne(Rex_db, { uuid: newRexUuid });

          if (!duplicatedRex || !duplicatedRex.actionEntries) continue;

          for (const originalActionUuid of Object.keys(originalRex.actionEntries)) {
            const newActionUuid = uuidMaps.actions.get(originalActionUuid);

            if (newActionUuid) {
              expect(duplicatedRex.actionEntries[newActionUuid]).toBeDefined();
            }
          }
        }
      }
    });
  });

  describe("Grid Duplication", () => {
    test("Should duplicate all grids with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no grids to test
      // This check might still be relevant if the grid creation failed for some reason
      if (sourceData.grids.length === 0) {
        console.warn("No grids to test in the source mission");
        return;
      }

      // 1. Get all grids from the original mission
      const originalGrids = sourceData.grids;

      // 2. Get all grids from the duplicated mission
      const duplicatedGrids = await em.find(Grid_db, { mission: { id: duplicatedMissionId } });
      expect(duplicatedGrids.length).toEqual(originalGrids.length);

      // 3. Verify grids were correctly duplicated
      for (const originalGrid of originalGrids) {
        // Get the mapped UUID
        const newUuid = uuidMaps.grids.get(originalGrid.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated grid with this UUID
        const duplicatedGrid = duplicatedGrids.find((g) => g.uuid === newUuid);
        expect(duplicatedGrid).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedGrid) {
          // Compare grid name (should be identical)
          expect(duplicatedGrid.name).toEqual(originalGrid.name);

          // Verify the mission ID was updated
          expect(duplicatedGrid.mission.id).toEqual(duplicatedMissionId);

          // Compare the grid properties
          expect(duplicatedGrid.numRows).toEqual(originalGrid.numRows);
          expect(duplicatedGrid.numCols).toEqual(originalGrid.numCols);
          expect(duplicatedGrid.spacing).toEqual(originalGrid.spacing);
          expect(duplicatedGrid.isActiveGrid).toEqual(originalGrid.isActiveGrid);
        }
      }
    });

    test("Should update active grid reference in mission", async () => {
      const em = globalValues.orm.em.fork();

      // Skip if the original mission doesn't have an active grid
      // This check might still be relevant if the grid creation/update failed
      if (!sourceData.mission.activeGridUuid) {
        console.warn("No active grid reference to test in source mission");
        return;
      }

      // Get the duplicated mission
      const duplicatedMission = await em.findOne(Mission_db, { id: duplicatedMissionId });
      expect(duplicatedMission).toBeDefined();

      if (!duplicatedMission) return;

      // Get the mapped grid UUID
      const newGridUuid = uuidMaps.grids.get(sourceData.mission.activeGridUuid);

      // Verify the active grid UUID was updated in the mission
      if (newGridUuid) {
        expect(duplicatedMission.activeGridUuid).toEqual(newGridUuid);
      }
    });
  });

  describe("Folder Duplication", () => {
    test("Should duplicate all folders with proper properties", async () => {
      const em = globalValues.orm.em.fork();

      // Skip the test if there are no folders to test
      if (sourceData.folders.length === 0) {
        console.warn("No folders to test in the source mission");
        return;
      }

      // 1. Get all folders from the original mission
      const originalFolders = sourceData.folders;

      // 2. Get all folders from the duplicated mission
      const duplicatedFolders = await em.find(Folder_db, { mission: { id: duplicatedMissionId } });
      expect(duplicatedFolders.length).toEqual(originalFolders.length);

      // 3. Verify folders were correctly duplicated
      for (const originalFolder of originalFolders) {
        // Get the mapped UUID
        const newUuid = uuidMaps.folders.get(originalFolder.uuid);
        expect(newUuid).toBeDefined();

        // Find the duplicated folder with this UUID
        const duplicatedFolder = duplicatedFolders.find((f) => f.uuid === newUuid);
        expect(duplicatedFolder).toBeDefined();

        // Verify the properties were duplicated correctly
        if (duplicatedFolder) {
          // Compare folder name (should be identical)
          expect(duplicatedFolder.name).toEqual(originalFolder.name);

          // Verify the mission ID was updated
          expect(duplicatedFolder.mission.id).toEqual(duplicatedMissionId);

          // Compare folder type
          expect(duplicatedFolder.type).toEqual(originalFolder.type);

          // Verify the items array length matches
          expect(duplicatedFolder.items.length).toEqual(originalFolder.items.length);
        }
      }
    });

    test("Should update entity references in folder items", async () => {
      const em = globalValues.orm.em.fork();

      // Skip if there are no folders to test
      if (sourceData.folders.length === 0) {
        console.warn("No folders to test in the source mission");
        return;
      }

      for (const originalFolder of sourceData.folders) {
        if (!originalFolder.items || originalFolder.items.length === 0) continue;

        // Get the mapped folder UUID
        const newFolderUuid = uuidMaps.folders.get(originalFolder.uuid);
        expect(newFolderUuid).toBeDefined();

        // Get the duplicated folder
        const duplicatedFolder = await em.findOne(Folder_db, { uuid: newFolderUuid });
        expect(duplicatedFolder).toBeDefined();

        if (!duplicatedFolder || !duplicatedFolder.items) continue;

        // Check each item in the folder based on folder type
        switch (originalFolder.type) {
          case "station":
            for (let i = 0; i < originalFolder.items.length; i++) {
              const originalStationUuid = originalFolder.items[i];
              const newStationUuid = uuidMaps.stations.get(originalStationUuid);

              if (newStationUuid) {
                // Check that the duplicated folder contains the new station UUID
                expect(duplicatedFolder.items).toContain(newStationUuid);
              }
            }
            break;

          case "poi":
            for (let i = 0; i < originalFolder.items.length; i++) {
              const originalPoiUuid = originalFolder.items[i];
              const newPoiUuid = uuidMaps.pois.get(originalPoiUuid);

              if (newPoiUuid) {
                // Check that the duplicated folder contains the new POI UUID
                expect(duplicatedFolder.items).toContain(newPoiUuid);
              }
            }
            break;

          case "eva":
            for (let i = 0; i < originalFolder.items.length; i++) {
              const originalEvaUuid = originalFolder.items[i];
              const newEvaUuid = uuidMaps.evas.get(originalEvaUuid);

              if (newEvaUuid) {
                // Check that the duplicated folder contains the new EVA UUID
                expect(duplicatedFolder.items).toContain(newEvaUuid);
              }
            }
            break;

          case "preset":
            for (let i = 0; i < originalFolder.items.length; i++) {
              const originalPresetUuid = originalFolder.items[i];
              const newPresetUuid = uuidMaps.presets.get(originalPresetUuid);

              if (newPresetUuid) {
                // Check that the duplicated folder contains the new Preset UUID
                expect(duplicatedFolder.items).toContain(newPresetUuid);
              }
            }
            break;

          case "layer":
            for (let i = 0; i < originalFolder.items.length; i++) {
              const originalLayerUuid = originalFolder.items[i];
              const newLayerUuid = uuidMaps.layers.get(originalLayerUuid);

              if (newLayerUuid) {
                // Check that the duplicated folder contains the new layer UUID
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
    // Clean up the database in the correct order respecting relationships
    const em = globalValues.orm.em.fork();

    // Use the deleteMissions function which handles cleaning up all related entities
    // in the correct order based on foreign key relationships
    if (duplicatedMissionId) {
      await deleteMissions([duplicatedMissionId]);
    }

    // Only delete the test user, not the original mission
    await em.nativeDelete(App_User_db, { id: testAppUser.id });

    // Close the ORM connection
    await globalValues.orm.close();
    globalValues.orm = null;
  });
});
