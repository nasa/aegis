import { describe, it, expect } from "vitest";
import { getSequenceUuidByRefUuidAndRexUuid, getActionDefinitionLabel } from "store/selectors";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankRex } from "store/storeUtils/rex";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getSequenceUuidByRefUuidAndRexUuid", () => {
  // -------------------------------------------------------------------------
  // rexUuid provided — looks up the REX's EVA sequence
  // -------------------------------------------------------------------------

  describe("when rexUuid is provided", () => {
    it("returns the station uuid when the station refUuid matches", () => {
      const station = generateBlankStation({ name: "Vitest Station A" });
      const eva = generateBlankEVA({
        sequence: [{ type: "station", uuid: station.uuid }],
      });
      const rexUuid = uuidv4();
      const rex = generateBlankRex({ uuid: rexUuid, evaUuid: eva.uuid });

      const mission = generateBlankMission({
        stations: { [station.uuid]: station },
        evas: { [eva.uuid]: eva },
        rexes: { [rexUuid]: rex },
      });

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: station.refUuid,
        rexUuid,
      });

      expect(result).toBe(station.uuid);
    });

    it("returns the traverse uuid when the traverse refUuid matches", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Traverse A" });
      const eva = generateBlankEVA({
        sequence: [{ type: "traverse", uuid: traverse.uuid }],
      });
      const rexUuid = uuidv4();
      const rex = generateBlankRex({ uuid: rexUuid, evaUuid: eva.uuid });

      const mission = generateBlankMission({
        traverses: { [traverse.uuid]: traverse },
        evas: { [eva.uuid]: eva },
        rexes: { [rexUuid]: rex },
      });

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: traverse.refUuid,
        rexUuid,
      });

      expect(result).toBe(traverse.uuid);
    });

    it("returns undefined when no sequence item matches the refUuid", () => {
      const station = generateBlankStation();
      const eva = generateBlankEVA({
        sequence: [{ type: "station", uuid: station.uuid }],
      });
      const rexUuid = uuidv4();
      const rex = generateBlankRex({ uuid: rexUuid, evaUuid: eva.uuid });

      const mission = generateBlankMission({
        stations: { [station.uuid]: station },
        evas: { [eva.uuid]: eva },
        rexes: { [rexUuid]: rex },
      });

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: uuidv4(), // random — won't match anything
        rexUuid,
      });

      expect(result).toBeUndefined();
    });

    it("returns undefined when the rexUuid does not exist in the mission", () => {
      const mission = generateBlankMission();

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: uuidv4(),
        rexUuid: uuidv4(),
      });

      expect(result).toBeUndefined();
    });

    it("returns the correct item when the sequence has multiple entries", () => {
      const stationA = generateBlankStation({ name: "Vitest Station A" });
      const stationB = generateBlankStation({ name: "Vitest Station B" });
      const traverse = generateBlankTraverse({ name: "Vitest Traverse 1" });
      const eva = generateBlankEVA({
        sequence: [
          { type: "station", uuid: stationA.uuid },
          { type: "traverse", uuid: traverse.uuid },
          { type: "station", uuid: stationB.uuid },
        ],
      });
      const rexUuid = uuidv4();
      const rex = generateBlankRex({ uuid: rexUuid, evaUuid: eva.uuid });

      const mission = generateBlankMission({
        stations: { [stationA.uuid]: stationA, [stationB.uuid]: stationB },
        traverses: { [traverse.uuid]: traverse },
        evas: { [eva.uuid]: eva },
        rexes: { [rexUuid]: rex },
      });

      // Look up the traverse by its refUuid
      expect(
        getSequenceUuidByRefUuidAndRexUuid(mission, { refUuid: traverse.refUuid, rexUuid })
      ).toBe(traverse.uuid);

      // Look up the second station by its refUuid
      expect(
        getSequenceUuidByRefUuidAndRexUuid(mission, { refUuid: stationB.refUuid, rexUuid })
      ).toBe(stationB.uuid);
    });
  });

  // -------------------------------------------------------------------------
  // rexUuid === null — searches all as-planned EVA sequences
  // -------------------------------------------------------------------------

  describe("when rexUuid is null", () => {
    it("returns the station uuid from an as-planned EVA", () => {
      const station = generateBlankStation({ name: "Vitest Planned Station" });
      const eva = generateBlankEVA({
        sequence: [{ type: "station", uuid: station.uuid }],
      });

      const mission = generateBlankMission({
        stations: { [station.uuid]: station },
        evas: { [eva.uuid]: eva },
        rexes: {},
      });

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: station.refUuid,
        rexUuid: null,
      });

      expect(result).toBe(station.uuid);
    });

    it("returns the traverse uuid from an as-planned EVA", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Planned Traverse" });
      const eva = generateBlankEVA({
        sequence: [{ type: "traverse", uuid: traverse.uuid }],
      });

      const mission = generateBlankMission({
        traverses: { [traverse.uuid]: traverse },
        evas: { [eva.uuid]: eva },
        rexes: {},
      });

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: traverse.refUuid,
        rexUuid: null,
      });

      expect(result).toBe(traverse.uuid);
    });

    it("skips REX EVAs and only searches as-planned EVAs", () => {
      const rexStation = generateBlankStation({ name: "Vitest REX Station" });
      const plannedStation = generateBlankStation({ name: "Vitest Planned Station" });

      const rexEva = generateBlankEVA({
        sequence: [{ type: "station", uuid: rexStation.uuid }],
      });
      const plannedEva = generateBlankEVA({
        sequence: [{ type: "station", uuid: plannedStation.uuid }],
      });

      const rexUuid = uuidv4();
      const rex = generateBlankRex({ uuid: rexUuid, evaUuid: rexEva.uuid });

      const mission = generateBlankMission({
        stations: {
          [rexStation.uuid]: rexStation,
          [plannedStation.uuid]: plannedStation,
        },
        evas: { [rexEva.uuid]: rexEva, [plannedEva.uuid]: plannedEva },
        rexes: { [rexUuid]: rex },
      });

      // rexStation is in a REX EVA — should NOT be found when rexUuid is null
      expect(
        getSequenceUuidByRefUuidAndRexUuid(mission, { refUuid: rexStation.refUuid, rexUuid: null })
      ).toBeUndefined();

      // plannedStation is in an as-planned EVA — should be found
      expect(
        getSequenceUuidByRefUuidAndRexUuid(mission, {
          refUuid: plannedStation.refUuid,
          rexUuid: null,
        })
      ).toBe(plannedStation.uuid);
    });

    it("returns undefined when there are no EVAs at all", () => {
      const mission = generateBlankMission();

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: uuidv4(),
        rexUuid: null,
      });

      expect(result).toBeUndefined();
    });

    it("returns undefined when refUuid does not match any as-planned sequence item", () => {
      const station = generateBlankStation();
      const eva = generateBlankEVA({
        sequence: [{ type: "station", uuid: station.uuid }],
      });

      const mission = generateBlankMission({
        stations: { [station.uuid]: station },
        evas: { [eva.uuid]: eva },
        rexes: {},
      });

      const result = getSequenceUuidByRefUuidAndRexUuid(mission, {
        refUuid: uuidv4(), // random — won't match
        rexUuid: null,
      });

      expect(result).toBeUndefined();
    });

    it("finds a match across multiple as-planned EVAs", () => {
      const stationInEva1 = generateBlankStation({ name: "Vitest EVA1 Station" });
      const stationInEva2 = generateBlankStation({ name: "Vitest EVA2 Station" });

      const eva1 = generateBlankEVA({
        sequence: [{ type: "station", uuid: stationInEva1.uuid }],
      });
      const eva2 = generateBlankEVA({
        sequence: [{ type: "station", uuid: stationInEva2.uuid }],
      });

      const mission = generateBlankMission({
        stations: {
          [stationInEva1.uuid]: stationInEva1,
          [stationInEva2.uuid]: stationInEva2,
        },
        evas: { [eva1.uuid]: eva1, [eva2.uuid]: eva2 },
        rexes: {},
      });

      // Should find the station that lives in the second EVA
      expect(
        getSequenceUuidByRefUuidAndRexUuid(mission, {
          refUuid: stationInEva2.refUuid,
          rexUuid: null,
        })
      ).toBe(stationInEva2.uuid);
    });
  });
});

describe("getActionDefinitionLabel", () => {
  it("returns the singular label for each type", () => {
    const mission = {
      actionDefinitionLabels: {
        verb: { singular: "Task", plural: "Tasks" },
        noun: { singular: "Focus", plural: "Foci" },
        adjective: { singular: "Context", plural: "Contexts" },
      },
    };
    expect(getActionDefinitionLabel(mission, "verbs")).toBe("Task");
    expect(getActionDefinitionLabel(mission, "nouns")).toBe("Focus");
    expect(getActionDefinitionLabel(mission, "adjectives")).toBe("Context");
  });

  it("returns the plural label for each type", () => {
    const mission = {
      actionDefinitionLabels: {
        verb: { singular: "Task", plural: "Tasks" },
        noun: { singular: "Focus", plural: "Foci" },
        adjective: { singular: "Context", plural: "Contexts" },
      },
    };
    expect(getActionDefinitionLabel(mission, "verbs", "plural")).toBe("Tasks");
    expect(getActionDefinitionLabel(mission, "nouns", "plural")).toBe("Foci");
    expect(getActionDefinitionLabel(mission, "adjectives", "plural")).toBe("Contexts");
  });
});
