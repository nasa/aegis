import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import {
  applyUpsertRex,
  applyUpdateRexByField,
  applyRexPetStartStop,
  applyUpdatePosSourceField,
  applyUpdatePosTypeField,
  applyDeletePosSource,
  applyDeletePosType,
} from "operations/apply/apply-rex";
import { generateBlankPosType, generateBlankRex } from "store/storeUtils/rex";
import { v4 as uuidv4 } from "uuid";

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.rexes = {};
    m.evas = {};
    m.stations = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-rex", () => {
  // ─────────────────────────────────────────────────────────────────────────
  describe("applyUpdateRexByField()", () => {
    it("updates a single field on a rex", () => {
      const rex = generateBlankRex({ name: "Vitest Original", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      getMissionDocHandle().change((m) =>
        applyUpdateRexByField(m, {
          rexUuid: rex.uuid,
          fieldName: "name",
          value: "Vitest Updated Name",
        })
      );
      expect(getMission().rexes[rex.uuid].name).toBe("Vitest Updated Name");
    });

    it("is a no-op if rex doesn't exist", () => {
      getMissionDocHandle().change((m) =>
        applyUpdateRexByField(m, { rexUuid: "non-existent", fieldName: "name", value: "Whatever" })
      );
      expect(Object.keys(getMission().rexes).length).toBe(0);
    });

    it("preserves updatedAt when preserveUpdatedAt is true", () => {
      const rex = generateBlankRex({ name: "Vitest Original", evaUuid: uuidv4() });
      rex.updatedAt = 12345;
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      getMissionDocHandle().change((m) =>
        applyUpdateRexByField(m, {
          rexUuid: rex.uuid,
          fieldName: "name",
          value: "X",
          preserveUpdatedAt: true,
        })
      );
      expect(getMission().rexes[rex.uuid].updatedAt).toBe(12345);
    });

    it("updates updatedAt by default", () => {
      const rex = generateBlankRex({ name: "Vitest Original", evaUuid: uuidv4() });
      rex.updatedAt = 12345;
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      getMissionDocHandle().change((m) =>
        applyUpdateRexByField(m, { rexUuid: rex.uuid, fieldName: "name", value: "X" })
      );
      expect(getMission().rexes[rex.uuid].updatedAt).not.toBe(12345);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe("applyRexPetStartStop()", () => {
    it("sets petRunning=true on start, with petValue and timestamp", () => {
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      getMissionDocHandle().change((m) =>
        applyRexPetStartStop(m, { rexUuid: rex.uuid, directive: "start", petValue: "+00:10:00" })
      );
      const updated = getMission().rexes[rex.uuid];
      expect(updated.petRunning).toBe(true);
      expect(updated.petValueAtStartStop).toBe("+00:10:00");
      expect(updated.petStartStopTimestamp).toBeTruthy();
    });

    it("sets petRunning=false on stop", () => {
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      getMissionDocHandle().change((m) =>
        applyRexPetStartStop(m, { rexUuid: rex.uuid, directive: "stop", petValue: "+00:15:00" })
      );
      expect(getMission().rexes[rex.uuid].petRunning).toBe(false);
      expect(getMission().rexes[rex.uuid].petValueAtStartStop).toBe("+00:15:00");
    });

    it("is a no-op if rex doesn't exist", () => {
      getMissionDocHandle().change((m) =>
        applyRexPetStartStop(m, { rexUuid: "missing", directive: "start", petValue: "+00:00:00" })
      );
      expect(Object.keys(getMission().rexes).length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NOTE: applyAddRexStatusEntry, applyAddRexActionMass, applyAddCollectionId tests
  // have been migrated to src/tests/vitest/store/thunks/rex_thunk.test.ts
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  describe("applyUpdatePosSourceField()", () => {
    it("updates a field on a posSource", () => {
      const rex = generateBlankRex({ name: "Vitest R", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      const ps = rex.posSources[0];
      getMissionDocHandle().change((m) =>
        applyUpdatePosSourceField(m, {
          rexUuid: rex.uuid,
          uuid: ps.uuid,
          fieldName: "name",
          value: "Renamed",
        })
      );
      expect(getMission().rexes[rex.uuid].posSources[0].name).toBe("Renamed");
    });

    it("is a no-op if rex doesn't exist", () => {
      getMissionDocHandle().change((m) =>
        applyUpdatePosSourceField(m, {
          rexUuid: "missing",
          uuid: uuidv4(),
          fieldName: "name",
          value: "X",
        })
      );
      expect(Object.keys(getMission().rexes).length).toBe(0);
    });

    it("is a no-op if posSource doesn't exist", () => {
      const rex = generateBlankRex({ name: "Vitest R", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      const before = getMission().rexes[rex.uuid].posSources.map((s) => s.name);
      getMissionDocHandle().change((m) =>
        applyUpdatePosSourceField(m, {
          rexUuid: rex.uuid,
          uuid: "non-existent",
          fieldName: "name",
          value: "X",
        })
      );
      const after = getMission().rexes[rex.uuid].posSources.map((s) => s.name);
      expect(after).toEqual(before);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NOTE: guard tests (in-use, last-remaining) are covered by thunkDeletePosSource
  // in src/tests/vitest/store/thunks/rexPosSource_thunk.test.ts
  describe("applyDeletePosSource()", () => {
    it("deletes a posSource from the rex", () => {
      const rex = generateBlankRex({ name: "Vitest R", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      const psToDelete = rex.posSources[0];
      getMissionDocHandle().change((m) =>
        applyDeletePosSource(m, { rexUuid: rex.uuid, posSourceUuid: psToDelete.uuid })
      );
      expect(getMission().rexes[rex.uuid].posSources.some((s) => s.uuid === psToDelete.uuid)).toBe(
        false
      );
    });

    it("is a no-op if rex doesn't exist", () => {
      getMissionDocHandle().change((m) =>
        applyDeletePosSource(m, { rexUuid: "missing", posSourceUuid: uuidv4() })
      );
      expect(Object.keys(getMission().rexes).length).toBe(0);
    });
  });

  // NOTE: applyCreateInitialPosEntries tests have been migrated to thunkCreateInitialPosEntries
  // in src/tests/vitest/store/thunks/rex_thunk.test.ts

  // ─────────────────────────────────────────────────────────────────────────
  describe("applyUpdatePosTypeField()", () => {
    it("updates a field on a posType", () => {
      const rex = generateBlankRex({ name: "Vitest R", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      const pt = rex.posTypes[0];
      getMissionDocHandle().change((m) =>
        applyUpdatePosTypeField(m, {
          rexUuid: rex.uuid,
          uuid: pt.uuid,
          fieldName: "name",
          value: "Renamed Type",
        })
      );
      expect(getMission().rexes[rex.uuid].posTypes[0].name).toBe("Renamed Type");
    });

    it("is a no-op if rex doesn't exist", () => {
      getMissionDocHandle().change((m) =>
        applyUpdatePosTypeField(m, {
          rexUuid: "missing",
          uuid: uuidv4(),
          fieldName: "name",
          value: "X",
        })
      );
      expect(Object.keys(getMission().rexes).length).toBe(0);
    });

    it("is a no-op if posType doesn't exist on the rex", () => {
      const rex = generateBlankRex({ name: "Vitest R", evaUuid: uuidv4() });
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      const before = getMission().rexes[rex.uuid].posTypes.map((t) => t.name);
      getMissionDocHandle().change((m) =>
        applyUpdatePosTypeField(m, {
          rexUuid: rex.uuid,
          uuid: "non-existent",
          fieldName: "name",
          value: "X",
        })
      );
      const after = getMission().rexes[rex.uuid].posTypes.map((t) => t.name);
      expect(after).toEqual(before);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NOTE: guard test (in-use) is covered by thunkDeletePosType
  // in src/tests/vitest/store/thunks/rexPosEntry_thunk.test.ts
  describe("applyDeletePosType()", () => {
    it("deletes a posType from the rex", () => {
      const rex = generateBlankRex({ name: "Vitest R", evaUuid: uuidv4() });
      // add an extra posType so we have one that's not referenced
      const extra = generateBlankPosType({ name: "Vitest Extra" });
      rex.posTypes.push(extra);
      getMissionDocHandle().change((m) => applyUpsertRex(m, rex));
      getMissionDocHandle().change((m) =>
        applyDeletePosType(m, { rexUuid: rex.uuid, posTypeUuid: extra.uuid })
      );
      expect(getMission().rexes[rex.uuid].posTypes.some((t) => t.uuid === extra.uuid)).toBe(false);
    });

    it("is a no-op if rex doesn't exist", () => {
      getMissionDocHandle().change((m) =>
        applyDeletePosType(m, { rexUuid: "missing", posTypeUuid: uuidv4() })
      );
      expect(Object.keys(getMission().rexes).length).toBe(0);
    });
  });
});
