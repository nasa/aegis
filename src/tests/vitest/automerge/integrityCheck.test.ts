/**
 * integrityCheck.test.ts
 *
 * Unit tests for the `checkMissionIntegrity` FK integrity checker.
 * The function is pure (read-only, no I/O), so no mocking of Automerge,
 * database, or file-system is required.
 */
import { checkMissionIntegrity } from "server/automerge/checkMissionIntegrity";
import type { IntegrityFinding } from "server/automerge/checkMissionIntegrity";
import { generateBlankMission, generateDefaultActionDefinitions } from "store/storeUtils/mission";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankRex, generateBlankPosEntry } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateFullMission } from "tests/vitest/fixtures/mission";
import { v4 as uuidv4 } from "uuid";

/** Build a minimal but fully-valid Mission (no entities, no dangling refs). */
const makeEmptyMission = (): Mission =>
  generateBlankMission({ name: "Vitest Integrity Test Mission" });

/** Extract the field names of all findings for quick assertions. */
const findingFields = (findings: IntegrityFinding[]) => findings.map((f) => f.field);

describe("checkMissionIntegrity()", () => {
  describe("clean mission produces no findings", () => {
    it("returns [] for an empty mission (no entities)", () => {
      const mission = makeEmptyMission();
      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("returns [] for the fully-wired generateFullMission() fixture", () => {
      const mission = generateFullMission();
      expect(checkMissionIntegrity(99, mission)).toEqual([]);
    });

    it("populates missionId and missionName on findings", () => {
      const mission = makeEmptyMission();
      mission.name = "Vitest Named Mission";
      const station = generateBlankStation({ name: "Vitest S1" });
      station.actionOrderUuids = [uuidv4()]; // orphan
      mission.stations[station.uuid] = station;

      const findings = checkMissionIntegrity(42, mission);
      expect(findings).toHaveLength(1);
      expect(findings[0].missionId).toBe(42);
      expect(findings[0].missionName).toBe("Vitest Named Mission");
    });
  });

  // ── POI checks ────────────────────────────────────────────────────────────

  describe("POI integrity", () => {
    it("reports orphaned actionOrderUuids on a POI", () => {
      const mission = makeEmptyMission();
      const poi = generateBlankPoi({ name: "Vitest POI-1" });
      const orphanUuid = uuidv4();
      poi.actionOrderUuids = [orphanUuid];
      mission.pois[poi.uuid] = poi;

      const findings = checkMissionIntegrity(1, mission);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        entity: "POI",
        entityUuid: poi.uuid,
        field: "actionOrderUuids",
        orphanedUuid: orphanUuid,
      });
    });

    it("does not report a POI actionOrderUuid that exists", () => {
      const mission = makeEmptyMission();
      const action = generateBlankAction({ name: "Vitest A1" });
      const poi = generateBlankPoi({ name: "Vitest POI-1" });
      poi.actionOrderUuids = [action.uuid];
      mission.actions[action.uuid] = action;
      mission.pois[poi.uuid] = poi;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });
  });

  // ── Station checks ────────────────────────────────────────────────────────

  describe("Station integrity", () => {
    it("reports orphaned actionOrderUuids on a Station", () => {
      const mission = makeEmptyMission();
      const station = generateBlankStation({ name: "Vitest S1" });
      const orphanUuid = uuidv4();
      station.actionOrderUuids = [orphanUuid];
      mission.stations[station.uuid] = station;

      const findings = checkMissionIntegrity(1, mission);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        entity: "Station",
        entityUuid: station.uuid,
        field: "actionOrderUuids",
        orphanedUuid: orphanUuid,
      });
    });

    it("reports orphaned poiUuids on a Station", () => {
      const mission = makeEmptyMission();
      const station = generateBlankStation({ name: "Vitest S1" });
      const orphanUuid = uuidv4();
      station.poiUuids = [orphanUuid];
      mission.stations[station.uuid] = station;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("poiUuids");
      expect(findings[0].orphanedUuid).toBe(orphanUuid);
    });

    it("does not report a Station poiUuid that exists", () => {
      const mission = makeEmptyMission();
      const poi = generateBlankPoi({ name: "Vitest P1" });
      const station = generateBlankStation({ name: "Vitest S1" });
      station.poiUuids = [poi.uuid];
      mission.pois[poi.uuid] = poi;
      mission.stations[station.uuid] = station;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });
  });

  // ── Traverse checks ───────────────────────────────────────────────────────

  describe("Traverse integrity", () => {
    it("reports orphaned actionOrderUuids on a Traverse", () => {
      const mission = makeEmptyMission();
      const traverse = generateBlankTraverse({ name: "Vitest T1" });
      const orphanUuid = uuidv4();
      traverse.actionOrderUuids = [orphanUuid];
      mission.traverses[traverse.uuid] = traverse;

      const findings = checkMissionIntegrity(1, mission);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        entity: "Traverse",
        entityUuid: traverse.uuid,
        field: "actionOrderUuids",
        orphanedUuid: orphanUuid,
      });
    });

    it("does not report a Traverse actionOrderUuid that exists", () => {
      const mission = makeEmptyMission();
      const action = generateBlankAction({ name: "Vitest A1" });
      const traverse = generateBlankTraverse({ name: "Vitest T1" });
      traverse.actionOrderUuids = [action.uuid];
      mission.actions[action.uuid] = action;
      mission.traverses[traverse.uuid] = traverse;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });
  });

  // ── Action checks ─────────────────────────────────────────────────────────

  describe("Action integrity", () => {
    it("reports orphaned poiUuid on an Action", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const action = generateBlankAction({ name: "Vitest A1", poiUuid: orphanUuid });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        entity: "Action",
        entityUuid: action.uuid,
        field: "poiUuid",
        orphanedUuid: orphanUuid,
      });
    });

    it("reports orphaned stationUuid on an Action", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const action = generateBlankAction({ name: "Vitest A1", stationUuid: orphanUuid });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("stationUuid");
      expect(findings[0].orphanedUuid).toBe(orphanUuid);
    });

    it("reports orphaned traverseUuid on an Action", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const action = generateBlankAction({ name: "Vitest A1", traverseUuid: orphanUuid });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("traverseUuid");
      expect(findings[0].orphanedUuid).toBe(orphanUuid);
    });

    it("reports orphaned parentActionUuid on an Action", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const action = generateBlankAction({ name: "Vitest A1", parentActionUuid: orphanUuid });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("parentActionUuid");
      expect(findings[0].orphanedUuid).toBe(orphanUuid);
    });

    it("does not report parentActionUuid when the parent exists", () => {
      const mission = makeEmptyMission();
      const parent = generateBlankAction({ name: "Vitest Parent" });
      const child = generateBlankAction({ name: "Vitest Child", parentActionUuid: parent.uuid });
      mission.actions[parent.uuid] = parent;
      mission.actions[child.uuid] = child;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("reports orphaned equipmentItemsUsage on an Action", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const action = generateBlankAction({
        name: "Vitest A1",
        equipmentItemsUsage: { [orphanUuid]: { quantityUsed: 1 } },
      });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("equipmentItemsUsage");
      expect(findings[0].orphanedUuid).toBe(orphanUuid);
    });

    it("does not report equipmentItemsUsage when the item exists on the mission", () => {
      const mission = makeEmptyMission();
      const equipUuid = uuidv4();
      mission.equipmentItems = {
        [equipUuid]: { name: "Vitest Hammer", quantity: 1, singleUse: false },
      };
      const action = generateBlankAction({
        name: "Vitest A1",
        equipmentItemsUsage: { [equipUuid]: { quantityUsed: 1 } },
      });
      mission.actions[action.uuid] = action;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("reports orphaned geographicUnitsUsage on an Action", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const action = generateBlankAction({ name: "Vitest A1", geographicUnitsUsage: [orphanUuid] });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("geographicUnitsUsage");
      expect(findings[0].orphanedUuid).toBe(orphanUuid);
    });

    it("does not report geographicUnitsUsage when the unit exists", () => {
      const mission = makeEmptyMission();
      const geoUuid = uuidv4();
      mission.geographicUnits = { [geoUuid]: { name: "Vitest Unit A", abbr: "A" } };
      const action = generateBlankAction({ name: "Vitest A1", geographicUnitsUsage: [geoUuid] });
      mission.actions[action.uuid] = action;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("reports orphaned missionPriorityUuid on an Action", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const action = generateBlankAction({ name: "Vitest A1", missionPriorityUuid: orphanUuid });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("missionPriorityUuid");
      expect(findings[0].orphanedUuid).toBe(orphanUuid);
    });

    it("does not report missionPriorityUuid when the priority exists", () => {
      const mission = makeEmptyMission();
      const missionPriorityUuid = uuidv4();
      mission.missionPriorities = {
        [missionPriorityUuid]: { trace: "SIMD-0001", category: "Vitest Category" },
      };
      const action = generateBlankAction({ name: "Vitest A1", missionPriorityUuid });
      mission.actions[action.uuid] = action;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    describe("actionDefinition FK checks", () => {
      it("reports orphaned verbUuid", () => {
        const mission = makeEmptyMission();
        const orphanUuid = uuidv4();
        const action = generateBlankAction({
          name: "Vitest A1",
          actionDefinition: { verbUuid: orphanUuid, nounUuid: null, adjectiveUuid: null },
        });
        mission.actions[action.uuid] = action;

        const findings = checkMissionIntegrity(1, mission);
        expect(findingFields(findings)).toContain("actionDefinition.verbUuid");
        expect(findings[0].orphanedUuid).toBe(orphanUuid);
      });

      it("reports orphaned nounUuid", () => {
        const mission = makeEmptyMission();
        const orphanUuid = uuidv4();
        const action = generateBlankAction({
          name: "Vitest A1",
          actionDefinition: { verbUuid: null, nounUuid: orphanUuid, adjectiveUuid: null },
        });
        mission.actions[action.uuid] = action;

        const findings = checkMissionIntegrity(1, mission);
        expect(findingFields(findings)).toContain("actionDefinition.nounUuid");
      });

      it("reports orphaned adjectiveUuid", () => {
        const mission = makeEmptyMission();
        const orphanUuid = uuidv4();
        const action = generateBlankAction({
          name: "Vitest A1",
          actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: orphanUuid },
        });
        mission.actions[action.uuid] = action;

        const findings = checkMissionIntegrity(1, mission);
        expect(findingFields(findings)).toContain("actionDefinition.adjectiveUuid");
      });

      it("does not report actionDefinition UUIDs that exist in mission actionDefinitions", () => {
        const mission = makeEmptyMission();
        const defs = generateDefaultActionDefinitions();
        mission.actionDefinitions = defs;

        const verbUuid = Object.keys(defs.verbs)[0];
        const nounUuid = Object.keys(defs.nouns)[0];
        const adjectiveUuid = Object.keys(defs.adjectives)[0];

        const action = generateBlankAction({
          name: "Vitest A1",
          actionDefinition: { verbUuid, nounUuid, adjectiveUuid },
        });
        mission.actions[action.uuid] = action;

        expect(checkMissionIntegrity(1, mission)).toEqual([]);
      });

      it("does not report null actionDefinition UUID fields", () => {
        const mission = makeEmptyMission();
        const action = generateBlankAction({
          name: "Vitest A1",
          actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: null },
        });
        mission.actions[action.uuid] = action;

        expect(checkMissionIntegrity(1, mission)).toEqual([]);
      });
    });
  });

  // ── EVA checks ────────────────────────────────────────────────────────────

  describe("EVA integrity", () => {
    /** `[station, traverse, station]` built from real entities. */
    const makeWellFormedEva = (mission: Mission) => {
      const egress = generateBlankStation({ name: "Vitest Egress" });
      const ingress = generateBlankStation({ name: "Vitest Ingress" });
      const traverse = generateBlankTraverse({ name: "Vitest T1" });
      mission.stations[egress.uuid] = egress;
      mission.stations[ingress.uuid] = ingress;
      mission.traverses[traverse.uuid] = traverse;
      return generateBlankEVA({
        name: "Vitest EVA-1",
        sequence: [
          { type: "station", uuid: egress.uuid },
          { type: "traverse", uuid: traverse.uuid },
          { type: "station", uuid: ingress.uuid },
        ],
      });
    };

    it("reports an orphaned station uuid in an EVA sequence", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const eva = makeWellFormedEva(mission);
      eva.sequence[0] = { type: "station", uuid: orphanUuid };
      mission.evas[eva.uuid] = eva;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("sequence[].uuid (station)");
      expect(findings.find((f) => f.field === "sequence[].uuid (station)")!.orphanedUuid).toBe(
        orphanUuid
      );
    });

    it("reports an orphaned traverse uuid in an EVA sequence", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const eva = makeWellFormedEva(mission);
      eva.sequence[1] = { type: "traverse", uuid: orphanUuid };
      mission.evas[eva.uuid] = eva;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("sequence[].uuid (traverse)");
    });

    it("skips falsy (empty-string) uuid entries in EVA sequence", () => {
      const mission = makeEmptyMission();
      const eva = makeWellFormedEva(mission);
      eva.sequence[0] = { type: "station", uuid: "" };
      mission.evas[eva.uuid] = eva;

      // Empty-string uuid should be silently skipped, not reported as orphan.
      const findings = checkMissionIntegrity(1, mission).filter(
        (f) => f.field === "sequence[].uuid (station)"
      );
      expect(findings).toHaveLength(0);
    });

    it("reports a sequence that does not alternate station/traverse", () => {
      const mission = makeEmptyMission();
      const eva = makeWellFormedEva(mission);
      // Drop the trailing ingress station, leaving the sequence ending on a traverse.
      eva.sequence = eva.sequence.slice(0, 2);
      mission.evas[eva.uuid] = eva;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("sequence[] (shape)");
    });

    it("does not report a well-formed EVA sequence", () => {
      const mission = makeEmptyMission();
      const eva = makeWellFormedEva(mission);
      mission.evas[eva.uuid] = eva;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("does not report an EVA with an empty sequence", () => {
      const mission = makeEmptyMission();
      const eva = generateBlankEVA({ name: "Vitest EVA-1", sequence: [] });
      mission.evas[eva.uuid] = eva;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });
  });

  // ── Rex checks ────────────────────────────────────────────────────────────

  describe("Rex integrity", () => {
    it("reports orphaned evaUuid on a Rex", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: orphanUuid });
      mission.rexes[rex.uuid] = rex;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("evaUuid");
      expect(findings.find((f) => f.field === "evaUuid")!.orphanedUuid).toBe(orphanUuid);
    });

    it("does not report a null evaUuid on a Rex", () => {
      const mission = makeEmptyMission();
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: null });
      mission.rexes[rex.uuid] = rex;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("does not report evaUuid that exists", () => {
      const mission = makeEmptyMission();
      const eva = generateBlankEVA({
        name: "Vitest EVA-1",
        sequence: [],
      });
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: eva.uuid });
      mission.evas[eva.uuid] = eva;
      mission.rexes[rex.uuid] = rex;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("reports orphaned stationEntries on a Rex", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const rex = generateBlankRex({
        name: "Vitest Rex-1",
        evaUuid: null,
        stationEntries: { [orphanUuid]: { rexStatus: "pending" } },
      });
      mission.rexes[rex.uuid] = rex;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("stationEntries");
      expect(findings.find((f) => f.field === "stationEntries")!.orphanedUuid).toBe(orphanUuid);
    });

    it("reports orphaned traverseEntries on a Rex", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const rex = generateBlankRex({
        name: "Vitest Rex-1",
        evaUuid: null,
        traverseEntries: { [orphanUuid]: { rexStatus: "pending" } },
      });
      mission.rexes[rex.uuid] = rex;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("traverseEntries");
      expect(findings.find((f) => f.field === "traverseEntries")!.orphanedUuid).toBe(orphanUuid);
    });

    it("reports orphaned actionEntries on a Rex", () => {
      const mission = makeEmptyMission();
      const orphanUuid = uuidv4();
      const rex = generateBlankRex({
        name: "Vitest Rex-1",
        evaUuid: null,
        actionEntries: { [orphanUuid]: { rexStatus: "pending" } },
      });
      mission.rexes[rex.uuid] = rex;

      const findings = checkMissionIntegrity(1, mission);
      expect(findingFields(findings)).toContain("actionEntries");
      expect(findings.find((f) => f.field === "actionEntries")!.orphanedUuid).toBe(orphanUuid);
    });

    it("reports orphaned posTypeUuid in posEntries (deduplicated)", () => {
      const mission = makeEmptyMission();
      const orphanPosTypeUuid = uuidv4();
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: null });
      // Two posEntries both referencing the same orphaned posTypeUuid.
      rex.posEntries = [
        generateBlankPosEntry({ posTypeUuids: [orphanPosTypeUuid] }),
        generateBlankPosEntry({ posTypeUuids: [orphanPosTypeUuid] }),
      ];
      mission.rexes[rex.uuid] = rex;

      const findings = checkMissionIntegrity(1, mission).filter(
        (f) => f.field === "posEntries[].posTypeUuids"
      );
      // Even though two posEntries both reference the same orphan, it should
      // appear only ONCE in the findings (deduplication).
      expect(findings).toHaveLength(1);
      expect(findings[0].orphanedUuid).toBe(orphanPosTypeUuid);
    });

    it("reports orphaned posSourceUuid in posEntries (deduplicated)", () => {
      const mission = makeEmptyMission();
      const orphanSourceUuid = uuidv4();
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: null });
      rex.posEntries = [
        generateBlankPosEntry({ posSourceUuid: orphanSourceUuid }),
        generateBlankPosEntry({ posSourceUuid: orphanSourceUuid }),
      ];
      mission.rexes[rex.uuid] = rex;

      const findings = checkMissionIntegrity(1, mission).filter(
        (f) => f.field === "posEntries[].posSourceUuid"
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].orphanedUuid).toBe(orphanSourceUuid);
    });

    it("does not report posTypeUuid when the posType exists on the same Rex", () => {
      const mission = makeEmptyMission();
      const rex = generateBlankRex({ name: "Vitest Rex-1", evaUuid: null });
      // rex.posTypes is seeded by generateBlankRex; grab one of its UUIDs.
      const validPosTypeUuid = rex.posTypes[0].uuid;
      rex.posEntries = [generateBlankPosEntry({ posTypeUuids: [validPosTypeUuid] })];
      mission.rexes[rex.uuid] = rex;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });

    it("does not report valid stationEntries / traverseEntries / actionEntries", () => {
      const mission = makeEmptyMission();
      const station = generateBlankStation({ name: "Vitest S1" });
      const traverse = generateBlankTraverse({ name: "Vitest T1" });
      const action = generateBlankAction({ name: "Vitest A1" });
      const eva = generateBlankEVA({
        name: "Vitest EVA-1",
        sequence: [],
      });
      const rex = generateBlankRex({
        name: "Vitest Rex-1",
        evaUuid: eva.uuid,
        stationEntries: { [station.uuid]: { rexStatus: "pending" } },
        traverseEntries: { [traverse.uuid]: { rexStatus: "pending" } },
        actionEntries: { [action.uuid]: { rexStatus: "pending" } },
      });
      mission.stations[station.uuid] = station;
      mission.traverses[traverse.uuid] = traverse;
      mission.actions[action.uuid] = action;
      mission.evas[eva.uuid] = eva;
      mission.rexes[rex.uuid] = rex;

      expect(checkMissionIntegrity(1, mission)).toEqual([]);
    });
  });

  // ── Multiple findings ──────────────────────────────────────────────────────

  describe("multiple simultaneous findings", () => {
    it("accumulates findings from different entity types", () => {
      const mission = makeEmptyMission();

      // POI with dangling action
      const poi = generateBlankPoi({ name: "Vitest P1" });
      poi.actionOrderUuids = [uuidv4()];
      mission.pois[poi.uuid] = poi;

      // Station with dangling action
      const station = generateBlankStation({ name: "Vitest S1" });
      station.actionOrderUuids = [uuidv4()];
      mission.stations[station.uuid] = station;

      // Action with dangling poiUuid
      const action = generateBlankAction({ name: "Vitest A1", poiUuid: uuidv4() });
      mission.actions[action.uuid] = action;

      const findings = checkMissionIntegrity(1, mission);
      expect(findings.length).toBeGreaterThanOrEqual(3);

      const entities = findings.map((f) => f.entity);
      expect(entities).toContain("POI");
      expect(entities).toContain("Station");
      expect(entities).toContain("Action");
    });
  });
});
