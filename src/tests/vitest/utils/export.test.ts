import { generateBlankAction } from "store/storeUtils/action";
import {
  DEFAULT_ACTION_DEFINITION_CONJUNCTIONS,
  DEFAULT_ACTION_DEFINITION_LABELS,
  generateBlankMission,
} from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { seedTerrainProfile, terrainProfiles } from "tests/vitest/fixtures/terrainProfiles";
import {
  makeEquipmentReadable,
  makeExportEvas,
  makeExportString,
  makeExportMission,
  makeReadableActionDefinition,
  makeReadableMissionPriority,
} from "utils/export";
import { getLgrsGridBearing } from "utils/lgrs/bearing";
import { moonGridSystem } from "@bfeist/planetary-grid-reference/moon";
import { getGridSystem } from "utils/lgrs/system";
import { getTrueBearingFromLatLngPoints } from "utils/mapping/geoMath";
import { v4 as uuidv4 } from "uuid";

describe("Export tests", () => {
  test("makeEquipmentReadable", () => {
    const equipmentItemUuid = uuidv4();
    const equipmentItem = {
      name: "Vitest test equipment",
      quantity: 99,
      singleUse: false,
    };
    const mission = generateBlankMission({
      name: "Vitest Mission-1",
      equipmentItems: { [equipmentItemUuid]: equipmentItem },
    });
    const equipmentItemUsageNotFoundUuid = uuidv4();
    const equipmentItemsUsage: EquipmentItemUsages = {
      [equipmentItemUuid]: { quantityUsed: 5 },
      [equipmentItemUsageNotFoundUuid]: { quantityUsed: 3 },
    };
    const readable = makeEquipmentReadable({
      equipmentItems: equipmentItemsUsage,
      mission: mission,
    });
    expect(readable[0]).toEqual({
      name: "Vitest test equipment",
      singleUse: false,
      quantityUsed: 5,
    });
    expect(readable[1]).toEqual({ name: undefined, singleUse: undefined, quantityUsed: 3 });
  });

  test("makeReadableMissionPriority", () => {
    const missionPriorityUuid = uuidv4();
    const mission = generateBlankMission({
      name: "Vitest Mission-1",
      missionPriorities: {
        [missionPriorityUuid]: { trace: "SIMD-0005.1", category: "Vitest Category" },
      },
    });

    expect(makeReadableMissionPriority({ missionPriorityUuid, mission })).toEqual({
      uuid: missionPriorityUuid,
      trace: "SIMD-0005.1",
      category: "Vitest Category",
      displayString: "SIMD-0005.1 | Vitest Category",
    });
    expect(makeReadableMissionPriority({ missionPriorityUuid: null, mission })).toBeNull();
    expect(makeReadableMissionPriority({ missionPriorityUuid: uuidv4(), mission })).toBeNull();
  });

  describe("makeReadableActionDefinition", () => {
    const verbUuid = uuidv4();
    const nounUuid = uuidv4();
    const adjectiveUuid = uuidv4();
    const verb = { name: "Sample", abbr: "SAM" };
    const noun = { name: "Rock", abbr: "RCK" };
    const adjective = { name: "Crater", abbr: "CRT" };

    const buildMission = (
      overrides?: Partial<Pick<Mission, "actionDefinitionConjunctions" | "actionDefinitionLabels">>
    ): Pick<
      Mission,
      "actionDefinitions" | "actionDefinitionConjunctions" | "actionDefinitionLabels"
    > => ({
      actionDefinitions: {
        verbs: { [verbUuid]: verb },
        nouns: { [nounUuid]: noun },
        adjectives: { [adjectiveUuid]: adjective },
      },
      actionDefinitionConjunctions: structuredClone(DEFAULT_ACTION_DEFINITION_CONJUNCTIONS),
      actionDefinitionLabels: structuredClone(DEFAULT_ACTION_DEFINITION_LABELS),
      ...overrides,
    });

    test("returns verb, noun, and adjective with default conjunctions when all are selected", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: { verbUuid, nounUuid, adjectiveUuid },
      });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Sample of Rock in Crater",
        verb: { uuid: verbUuid, ...verb },
        noun: { uuid: nounUuid, ...noun },
        adjective: { uuid: adjectiveUuid, ...adjective },
      });
    });

    test("omits the adjective and its conjunction when adjectiveUuid is null", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: { verbUuid, nounUuid, adjectiveUuid: null },
      });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Sample of Rock",
        verb: { uuid: verbUuid, ...verb },
        noun: { uuid: nounUuid, ...noun },
        adjective: null,
      });
    });

    test("uses custom conjunctions when provided", () => {
      const mission = buildMission({
        actionDefinitionConjunctions: { verbToNoun: "on", nounToAdjective: "within" },
      });
      const action = generateBlankAction({
        actionDefinition: { verbUuid, nounUuid, adjectiveUuid },
      });

      expect(makeReadableActionDefinition({ action, mission }).displayString).toBe(
        "Sample on Rock within Crater"
      );
    });

    test("falls back to the definition labels when verb/noun are unselected", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: null },
      });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Verb of Noun",
        verb: null,
        noun: null,
        adjective: null,
      });
    });

    test("falls back to custom definition labels when verb/noun are unselected", () => {
      const mission = buildMission({
        actionDefinitionLabels: {
          verb: { singular: "Task", plural: "Tasks" },
          noun: { singular: "Target", plural: "Targets" },
          adjective: { singular: "Descriptor", plural: "Descriptors" },
        },
      });
      const action = generateBlankAction({
        actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: null },
      });

      expect(makeReadableActionDefinition({ action, mission }).displayString).toBe(
        "Task of Target"
      );
    });

    test("handles a null actionDefinition on the action", () => {
      const mission = buildMission();
      const action = generateBlankAction({ actionDefinition: null });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Verb of Noun",
        verb: null,
        noun: null,
        adjective: null,
      });
    });

    test("returns null verb/noun/adjective when uuids no longer resolve in actionDefinitions", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: {
          verbUuid: uuidv4(),
          nounUuid: uuidv4(),
          adjectiveUuid: uuidv4(),
        },
      });

      const result = makeReadableActionDefinition({ action, mission });
      expect(result.verb).toEqual({ uuid: action.actionDefinition.verbUuid });
      expect(result.noun).toEqual({ uuid: action.actionDefinition.nounUuid });
      expect(result.adjective).toEqual({ uuid: action.actionDefinition.adjectiveUuid });
      // Unresolved verb/noun names fall back to the definition labels; an unresolved
      // adjective has no name, so its conjunction is omitted entirely.
      expect(result.displayString).toBe("Verb of Noun");
    });
  });

  test("exports full LGRS coordinates", () => {
    const mission = generateBlankMission({ name: "LGRS Export Mission" });
    mission.landerLocation = { lat: -89, lng: -133 };

    const output = makeExportString({
      terrainProfiles: {},
      mission,
      selectEvas: false,
      selectMission: true,
      selectPois: false,
      selectStations: false,
      selectActions: false,
      selectTraverses: false,
      selectRexes: false,
    });

    expect(JSON.parse(output).exportMission.gridCoordinates).toBe("AZM B95 D44");
  });

  // Oracle (lgrs 0.4.0) 10 m ACC labels in the "full" export style.
  test.each([
    ["LTM 23N", { lat: 0, lng: 0 }, "23NFF -00 -00"],
    ["LTM 34N", { lat: 45, lng: 90 }, "34TGQ S84 N71"],
    ["LTM 12S", { lat: -45, lng: -90 }, "12GDR G15 L28"],
    ["LTM 1N", { lat: 0, lng: -180 }, "1NAA C72 -00"],
    ["LPS N", { lat: 80, lng: 10 }, "ZCA B47 B40"],
  ])("exports full %s LGRS coordinates for every entity", (_system, location, expected) => {
    const mission = generateBlankMission({ name: "Whole-Moon LGRS Export Mission" });
    mission.landerLocation = location;
    const poi = generateBlankPoi({ location });
    const station = generateBlankStation({ location });
    const action = generateBlankAction({ location });
    mission.pois = { [poi.uuid]: poi };
    mission.stations = { [station.uuid]: station };
    mission.actions = { [action.uuid]: action };

    const output = JSON.parse(
      makeExportString({
        terrainProfiles: {},
        mission,
        selectEvas: false,
        selectMission: true,
        selectPois: true,
        selectStations: true,
        selectActions: true,
        selectTraverses: false,
        selectRexes: false,
      })
    );

    expect(output.exportMission.gridCoordinates).toBe(expected);
    for (const key of ["pois", "stations", "actions"]) {
      expect(output[key].map((item: { gridCoordinates: string }) => item.gridCoordinates)).toEqual([
        expected,
      ]);
    }
  });

  test("keeps the Maestro EVA shape: terrain arrays present, UI-only flags absent", () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.01 },
      ],
      pathSegmentDistances: [300],
    });
    seedTerrainProfile(traverse, [[0, 10, 5]]);
    const eva = generateBlankEVA({ sequence: [{ type: "traverse", uuid: traverse.uuid }] });
    const mission = generateBlankMission({
      traverses: { [traverse.uuid]: traverse },
      evas: { [eva.uuid]: eva },
    });

    const [exportEva] = makeExportEvas({
      terrainProfiles,
      evas: [eva],
      mission,
      missionGrid: undefined,
    });
    const exportTraverse = exportEva.sequenceReadable[0] as ExportTraverse;

    expect(exportTraverse.pathSegmentElevations).toEqual([[0, 10, 5]]);
    expect(exportTraverse.pathSegmentAbsoluteSlopes).toEqual([[null, null, null]]);
    expect(exportTraverse.calculatedFields.ascentDescent).toEqual({
      totalMetersClimbed: 10,
      totalMetersDescended: 5,
    });
    expect(exportTraverse.calculatedFields).not.toHaveProperty("ascentDescentAvailable");
    expect(exportEva.calculatedFields).not.toHaveProperty("totalTraverseAscentDescentAvailable");
  });

  describe("grid systems", () => {
    const JSC = { lat: 29.5593, lng: -95.09 };
    const JSC_MGRS = "15R TN 9751 7177";
    const path = [JSC, { lat: 29.5693, lng: -95.07 }];

    /** A mission with a POI, a station, an action and a one-traverse EVA, exported in full. */
    const exportAll = (fields: Partial<Mission>) => {
      const poi = generateBlankPoi({ location: JSC });
      const station = generateBlankStation({ location: JSC });
      const action = generateBlankAction({ location: JSC });
      const traverse = generateBlankTraverse({ path, pathSegmentDistances: [2200] });
      const eva = generateBlankEVA({
        sequence: [
          { type: "station", uuid: station.uuid },
          { type: "traverse", uuid: traverse.uuid },
        ],
      });
      const mission = generateBlankMission({
        landerLocation: JSC,
        pois: { [poi.uuid]: poi },
        stations: { [station.uuid]: station },
        actions: { [action.uuid]: action },
        traverses: { [traverse.uuid]: traverse },
        evas: { [eva.uuid]: eva },
        ...fields,
      });
      const output = JSON.parse(
        makeExportString({
          terrainProfiles: {},
          mission,
          selectEvas: true,
          selectMission: true,
          selectPois: true,
          selectStations: true,
          selectActions: true,
          selectTraverses: true,
          selectRexes: false,
        })
      );
      const located: ExportCoordinates[] = [
        output.exportMission,
        ...output.pois,
        ...output.stations,
        ...output.actions,
        output.evas[0].sequenceReadable[0],
      ];
      const bearings: number[] = [
        output.traverses[0].calculatedFields.bearings[0],
        output.evas[0].sequenceReadable[1].calculatedFields.bearings[0],
      ];
      return { output, located, bearings };
    };

    test("derives ACC coordinates, canonical MGRS and grid bearings for Earth", () => {
      const { output, located, bearings } = exportAll({
        planet: "earth",
      });
      expect(output.exportMission).toMatchObject({
        planet: "earth",
        earthGridLabelScheme: "lunar-acc",
      });
      for (const item of located) {
        expect(item).toMatchObject({
          gridCoordinates: "15RTNDC X51 W77",
          mgrsCoordinates: JSC_MGRS,
        });
      }
      for (const bearing of bearings) {
        expect(bearing).toBe(
          getLgrsGridBearing(getGridSystem("earth-wgs84", "lunar-acc"), path[0], path[1])
        );
      }
    });

    test("gives null MGRS for an item without a location", () => {
      const { output } = exportAll({
        planet: "earth",
        landerLocation: { lat: null, lng: null },
      });
      expect(output.exportMission).toHaveProperty("mgrsCoordinates", null);
    });

    // Depends on the Earth grid system (`getGridSystem("earth-wgs84", scheme)`).
    test.each([
      ["lunar-acc", "15RTNDC X51 W77"],
      ["mgrs", JSC_MGRS],
    ] as const)(
      "exports %s grid coordinates in the mission default scheme, plus MGRS",
      (earthGridLabelScheme, expected) => {
        const { output, located, bearings } = exportAll({
          planet: "earth",
          earthGridLabelScheme,
        });
        expect(output.exportMission.earthGridLabelScheme).toBe(earthGridLabelScheme);
        for (const item of located) {
          expect(item).toMatchObject({ gridCoordinates: expected, mgrsCoordinates: JSC_MGRS });
        }
        // Grid north in the origin's UTM zone, the same in either scheme.
        const gridBearing = getLgrsGridBearing(
          getGridSystem("earth-wgs84", "lunar-acc"),
          path[0],
          path[1]
        );
        expect(gridBearing).not.toBe(getTrueBearingFromLatLngPoints(path[0], path[1]));
        for (const bearing of bearings) expect(bearing).toBe(gridBearing);
      }
    );

    test("keeps lunar exports in ACC", () => {
      const { output, located, bearings } = exportAll({
        planet: "moon",
        earthGridLabelScheme: "mgrs",
      });
      expect(output.exportMission).toMatchObject({
        planet: "moon",
        earthGridLabelScheme: "lunar-acc",
      });
      for (const item of located) {
        expect(item).not.toHaveProperty("mgrsCoordinates");
        expect(item.gridCoordinates).toBe(moonGridSystem.formatPoint(JSC.lat, JSC.lng, 10, "full"));
      }
      for (const bearing of bearings) {
        expect(bearing).toBe(getLgrsGridBearing(moonGridSystem, path[0], path[1]));
      }
    });

    test("leaves Mars without a grid reference system", () => {
      const { output, located, bearings } = exportAll({ planet: "mars" });
      expect(output.exportMission.gridSystem).toBeNull();
      for (const bearing of bearings)
        expect(bearing).toBe(getTrueBearingFromLatLngPoints(path[0], path[1]));
      for (const item of located) expect(item).not.toHaveProperty("mgrsCoordinates");
    });
  });
});

test("uploaded Earth grids keep custom labels and canonical MGRS", () => {
  const point = { lat: 29.5593, lng: -95.09 };
  const mission = generateBlankMission({
    planet: "earth",
    landerLocation: point,
    serverFileGrid: { name: "USGS", fileName: "usgs.json", numRows: 3, numCols: 3 },
  });
  const exported = makeExportMission({
    mission,
    missionGrid: Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 3 }, (_, col) => ({
        id: row * 3 + col,
        index: { row, col },
        coordinates: { lat: point.lat + (1 - row) * 0.001, lng: point.lng + (col - 1) * 0.001 },
        name: "Custom A-1",
      }))
    ),
  });
  expect(exported.gridCoordinates).toBe("Custom A-1");
  expect(exported.mgrsCoordinates).toBe("15R TN 9751 7177");
});
