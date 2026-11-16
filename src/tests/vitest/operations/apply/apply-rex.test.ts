import * as Automerge from "@automerge/automerge";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import {
  applyUpsertRex,
  applyUpdateRexByField,
  applyRexPetStartStop,
  applyUpdatePosSourceField,
  applyUpdatePosTypeField,
  applyDeletePosSource,
  applyDeletePosType,
  applyFreezeExecuteEditMode,
  applyRegisterAddedStation,
  applyRegisterAddedTraverse,
  applyRegisterAddedAction,
  applyUnregisterAddedStation,
  applyUnregisterAddedTraverse,
  applyUnregisterAddedAction,
  applyCreatePosEntry,
  applyUpdatePosEntry,
  applyDeletePosEntry,
} from "operations/apply/apply-rex";
import {
  generateBlankPosEntry,
  generateBlankPosType,
  generateBlankRex,
} from "store/storeUtils/rex";
import { generateBlankMission } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

const getMission = (): Mission => getMissionDocHandle().doc();

describe("position entry collaboration", () => {
  const createMission = (entries?: PosEntry[]) => {
    const rex = generateBlankRex({
      uuid: "rex",
      evaUuid: "eva",
      ...(entries ? { posEntries: entries } : {}),
    });
    return Automerge.from({ ...generateBlankMission({ rexes: { rex } }) });
  };

  it("preserves simultaneous first additions from different sources", () => {
    const initial = createMission();
    const entryA = generateBlankPosEntry({ posSourceUuid: "crew" });
    const entryB = generateBlankPosEntry({ posSourceUuid: "task" });
    const docA = Automerge.change(Automerge.clone(initial), (m) =>
      applyCreatePosEntry(m, { rexUuid: "rex", posEntry: entryA })
    );
    const docB = Automerge.change(Automerge.clone(initial), (m) =>
      applyCreatePosEntry(m, { rexUuid: "rex", posEntry: entryB })
    );
    const merged = Automerge.merge(docA, docB);
    expect(merged.rexes.rex.posEntries.map((entry) => entry.uuid).sort()).toEqual(
      [entryA.uuid, entryB.uuid].sort()
    );
    expect(Automerge.toJS(Automerge.merge(docB, docA))).toEqual(Automerge.toJS(merged));
  });

  it("preserves an existing entry's concurrent edit when adding a position", () => {
    const existing = generateBlankPosEntry();
    const added = generateBlankPosEntry();
    const initial = createMission([existing]);
    const docA = Automerge.change(Automerge.clone(initial), (m) =>
      applyCreatePosEntry(m, { rexUuid: "rex", posEntry: added })
    );
    const docB = Automerge.change(Automerge.clone(initial), (m) =>
      applyUpdatePosEntry(m, {
        rexUuid: "rex",
        posEntryUuid: existing.uuid,
        changes: { notes: "Remote notes" },
      })
    );
    const entries = Automerge.merge(docA, docB).rexes.rex.posEntries;
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.uuid === existing.uuid).notes).toBe("Remote notes");
  });

  it("preserves a concurrent addition when deleting another position", () => {
    const existing = generateBlankPosEntry();
    const added = generateBlankPosEntry();
    const initial = createMission([existing]);
    const docA = Automerge.change(Automerge.clone(initial), (m) =>
      applyDeletePosEntry(m, { rexUuid: "rex", posEntryUuid: existing.uuid })
    );
    const docB = Automerge.change(Automerge.clone(initial), (m) =>
      applyCreatePosEntry(m, { rexUuid: "rex", posEntry: added })
    );
    expect(Automerge.merge(docA, docB).rexes.rex.posEntries).toEqual([added]);
  });

  it("preserves an edit to a different entry during deletion", () => {
    const deleted = generateBlankPosEntry();
    const kept = generateBlankPosEntry();
    const initial = createMission([deleted, kept]);
    const docA = Automerge.change(Automerge.clone(initial), (m) =>
      applyDeletePosEntry(m, { rexUuid: "rex", posEntryUuid: deleted.uuid })
    );
    const docB = Automerge.change(Automerge.clone(initial), (m) =>
      applyUpdatePosEntry(m, {
        rexUuid: "rex",
        posEntryUuid: kept.uuid,
        changes: { notes: "Keep this edit" },
      })
    );
    expect(Automerge.merge(docA, docB).rexes.rex.posEntries).toEqual([
      { ...kept, notes: "Keep this edit", updatedAt: expect.any(Number) },
    ]);
  });

  it("preserves simultaneous deletions of different entries", () => {
    const entryA = generateBlankPosEntry();
    const entryB = generateBlankPosEntry();
    const initial = createMission([entryA, entryB]);
    const docA = Automerge.change(Automerge.clone(initial), (m) =>
      applyDeletePosEntry(m, { rexUuid: "rex", posEntryUuid: entryA.uuid })
    );
    const docB = Automerge.change(Automerge.clone(initial), (m) =>
      applyDeletePosEntry(m, { rexUuid: "rex", posEntryUuid: entryB.uuid })
    );
    expect(Automerge.merge(docA, docB).rexes.rex.posEntries).toEqual([]);
  });
});

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
  describe("execute edit mode bookkeeping", () => {
    /**
     * Insert a rex under limited editing whose EVA holds the given sequence
     * parents, then execute it so the letter baseline is captured.
     */
    const seedExecutedRex = (actionOrderByParent: { [uuid: string]: string[] } = {}): Rex => {
      const evaUuid = uuidv4();
      const rex = generateBlankRex({ name: "Vitest Rex", evaUuid });
      rex.executeEditMode = "limited";
      getMissionDocHandle().change((m) => {
        applyUpsertRex(m, rex);
        m.evas[evaUuid] = {
          uuid: evaUuid,
          sequence: Object.keys(actionOrderByParent).map((uuid) => ({ type: "station", uuid })),
        } as unknown as Eva;
        for (const [uuid, actionOrderUuids] of Object.entries(actionOrderByParent)) {
          m.stations[uuid] = { actionOrderUuids } as unknown as Station;
        }
        applyFreezeExecuteEditMode(m, { rexUuid: rex.uuid });
      });
      return rex;
    };

    describe("applyFreezeExecuteEditMode()", () => {
      it("captures each sequence station's and traverse's action order", () => {
        const evaUuid = uuidv4();
        const rex = generateBlankRex({ name: "Vitest Rex", evaUuid });
        getMissionDocHandle().change((m) => {
          applyUpsertRex(m, rex);
          m.stations["station-1"] = { actionOrderUuids: ["a", "b"] } as unknown as Station;
          m.stations["station-2"] = { actionOrderUuids: [] } as unknown as Station;
          m.traverses["traverse-1"] = { actionOrderUuids: ["t1"] } as unknown as Traverse;
          m.evas[evaUuid] = {
            uuid: evaUuid,
            sequence: [
              { type: "station", uuid: "station-1" },
              { type: "traverse", uuid: "traverse-1" },
              { type: "station", uuid: "station-2" },
              // An unselected station slot is a supported state and is skipped.
              { type: "station", uuid: "" },
            ],
          } as unknown as Eva;
          applyFreezeExecuteEditMode(m, { rexUuid: rex.uuid });
        });

        expect(getMission().rexes[rex.uuid].executeEditState).toEqual({
          addedStationUuids: [],
          addedTraverseUuids: [],
          addedActionUuids: [],
          actionLetterOrderByParent: {
            "station-1": ["a", "b"],
            "station-2": [],
            "traverse-1": ["t1"],
          },
        });
      });

      it("does not re-snapshot across a stop / re-execute cycle", () => {
        const rex = seedExecutedRex({ "station-1": ["a"] });
        getMissionDocHandle().change((m) => {
          // Simulate work done while running, then a stop / re-execute.
          m.stations["station-1"].actionOrderUuids = ["a", "b", "c"];
          applyFreezeExecuteEditMode(m, { rexUuid: rex.uuid });
        });
        expect(getMission().rexes[rex.uuid].executeEditState.actionLetterOrderByParent).toEqual({
          "station-1": ["a"],
        });
      });

      it("is a no-op if rex doesn't exist", () => {
        getMissionDocHandle().change((m) => applyFreezeExecuteEditMode(m, { rexUuid: "missing" }));
        expect(Object.keys(getMission().rexes).length).toBe(0);
      });
    });

    describe("register / unregister added entities", () => {
      it("registers and unregisters a station", () => {
        const rex = seedExecutedRex();
        getMissionDocHandle().change((m) =>
          applyRegisterAddedStation(m, { rexUuid: rex.uuid, stationUuid: "station-new" })
        );
        expect(getMission().rexes[rex.uuid].executeEditState.addedStationUuids).toEqual([
          "station-new",
        ]);
        getMissionDocHandle().change((m) =>
          applyUnregisterAddedStation(m, { rexUuid: rex.uuid, stationUuid: "station-new" })
        );
        expect(getMission().rexes[rex.uuid].executeEditState.addedStationUuids).toEqual([]);
      });

      it("registers and unregisters a traverse", () => {
        const rex = seedExecutedRex();
        getMissionDocHandle().change((m) =>
          applyRegisterAddedTraverse(m, { rexUuid: rex.uuid, traverseUuid: "traverse-new" })
        );
        expect(getMission().rexes[rex.uuid].executeEditState.addedTraverseUuids).toEqual([
          "traverse-new",
        ]);
        getMissionDocHandle().change((m) =>
          applyUnregisterAddedTraverse(m, { rexUuid: rex.uuid, traverseUuid: "traverse-new" })
        );
        expect(getMission().rexes[rex.uuid].executeEditState.addedTraverseUuids).toEqual([]);
      });

      it("does not register the same uuid twice", () => {
        const rex = seedExecutedRex();
        getMissionDocHandle().change((m) => {
          applyRegisterAddedStation(m, { rexUuid: rex.uuid, stationUuid: "station-new" });
          applyRegisterAddedStation(m, { rexUuid: rex.uuid, stationUuid: "station-new" });
        });
        expect(getMission().rexes[rex.uuid].executeEditState.addedStationUuids).toEqual([
          "station-new",
        ]);
      });

      it("appends an added action to a pre-existing parent's letter baseline", () => {
        const rex = seedExecutedRex({ "station-1": ["a", "b"] });
        getMissionDocHandle().change((m) =>
          applyRegisterAddedAction(m, {
            rexUuid: rex.uuid,
            actionUuid: "action-new",
            parentUuid: "station-1",
          })
        );
        const state = getMission().rexes[rex.uuid].executeEditState;
        expect(state.addedActionUuids).toEqual(["action-new"]);
        expect(state.actionLetterOrderByParent["station-1"]).toEqual(["a", "b", "action-new"]);
      });

      it("creates no baseline entry for a parent added under limited editing", () => {
        const rex = seedExecutedRex();
        getMissionDocHandle().change((m) =>
          applyRegisterAddedAction(m, {
            rexUuid: rex.uuid,
            actionUuid: "action-new",
            parentUuid: "station-added",
          })
        );
        const state = getMission().rexes[rex.uuid].executeEditState;
        expect(state.addedActionUuids).toEqual(["action-new"]);
        expect(state.actionLetterOrderByParent["station-added"]).toBeUndefined();
      });

      it("unregisters an added action without touching the baseline", () => {
        const rex = seedExecutedRex({ "station-1": ["a"] });
        getMissionDocHandle().change((m) => {
          applyRegisterAddedAction(m, {
            rexUuid: rex.uuid,
            actionUuid: "action-new",
            parentUuid: "station-1",
          });
          applyUnregisterAddedAction(m, { rexUuid: rex.uuid, actionUuid: "action-new" });
        });
        const state = getMission().rexes[rex.uuid].executeEditState;
        expect(state.addedActionUuids).toEqual([]);
        expect(state.actionLetterOrderByParent["station-1"]).toEqual(["a", "action-new"]);
      });

      it("is a no-op before the rex has been executed", () => {
        const rex = generateBlankRex({ name: "Vitest Rex", evaUuid: uuidv4() });
        getMissionDocHandle().change((m) => {
          applyUpsertRex(m, rex);
          applyRegisterAddedStation(m, { rexUuid: rex.uuid, stationUuid: "station-new" });
        });
        expect(getMission().rexes[rex.uuid].executeEditState).toBeNull();
      });
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
