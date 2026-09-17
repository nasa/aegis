import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyDuplicateTraverse,
  applyDeleteTraverses,
  applyTraverseUpdatesStage,
  applyUpdateTraverseByField,
} from "operations/apply/apply-traverse";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankRex } from "store/storeUtils/rex";
import { v4 as uuidv4 } from "uuid";

const getMission = (): Mission => getMissionDocHandle().doc();

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.traverses = {};
    m.actions = {};
    m.rexes = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-traverse", () => {
  it("applies aligned elevation and terrain-slope profiles atomically", () => {
    const traverse = generateBlankTraverse();
    getMissionDocHandle().change((m) => {
      m.traverses[traverse.uuid] = traverse;
    });

    withMissionChange((m) =>
      applyTraverseUpdatesStage(m, [
        {
          traverseUuid: traverse.uuid,
          profileRevision: 1,
          newPath: [
            { lat: 1, lng: 2 },
            { lat: 3, lng: 4 },
          ],
          newPathSegmentDistances: [25],
          newPathSegmentElevations: [[10, 11]],
          newPathSegmentAbsoluteSlopes: [[null, 2.5]],
          updatedAt: 123,
        },
      ])
    );

    const updated = getMission().traverses[traverse.uuid];
    expect(updated.pathSegmentElevations).toEqual([[10, 11]]);
    expect(updated.pathSegmentAbsoluteSlopes).toEqual([[null, 2.5]]);
  });

  describe("applyUpdateTraverseByField()", () => {
    it("updates the specified field on an existing traverse", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Original Traverse" });
      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });

      withMissionChange((m) =>
        applyUpdateTraverseByField(m, {
          traverseUuid: traverse.uuid,
          fieldName: "name",
          value: "Vitest Updated Traverse",
        })
      );

      expect(getMissionDocHandle().doc().traverses[traverse.uuid].name).toBe(
        "Vitest Updated Traverse"
      );
    });

    it("updates traverse updatedAt by default", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Traverse" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });
      const before = missionDocHandle.doc().traverses[traverse.uuid].updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateTraverseByField(m, {
          traverseUuid: traverse.uuid,
          fieldName: "name",
          value: "Vitest New Name",
        })
      );

      expect(missionDocHandle.doc().traverses[traverse.uuid].updatedAt).toBeGreaterThan(before);
    });

    it("does not change updatedAt when preserveUpdatedAt is true", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Traverse", updatedAt: null });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });

      withMissionChange((m) =>
        applyUpdateTraverseByField(m, {
          traverseUuid: traverse.uuid,
          fieldName: "name",
          value: "Vitest Preserved",
          preserveUpdatedAt: true,
        })
      );

      expect(missionDocHandle.doc().traverses[traverse.uuid].updatedAt).toBeNull();
    });

    it("does nothing when traverse uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateTraverseByField(m, { traverseUuid: uuidv4(), fieldName: "name", value: "x" })
        )
      ).not.toThrow();
    });
  });

  describe("applyDuplicateTraverse()", () => {
    it("returns undefined when traverseUuid is an empty string", () => {
      let result: Traverse | undefined;
      withMissionChange((m) => {
        result = applyDuplicateTraverse(m, { traverseUuid: "", preserveRefUuid: false });
      });
      expect(result).toBeUndefined();
    });

    it("returns undefined when the source traverse does not exist", () => {
      let result: Traverse | undefined;
      withMissionChange((m) => {
        result = applyDuplicateTraverse(m, { traverseUuid: uuidv4(), preserveRefUuid: false });
      });
      expect(result).toBeUndefined();
    });

    it("creates a new traverse with a different uuid", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Source Traverse" });
      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });

      let newTraverse: Traverse | undefined;
      withMissionChange((m) => {
        newTraverse = applyDuplicateTraverse(m, {
          traverseUuid: traverse.uuid,
          preserveRefUuid: false,
        });
      });

      expect(newTraverse).toBeDefined();
      expect(newTraverse!.uuid).not.toBe(traverse.uuid);
      expect(getMissionDocHandle().doc().traverses[newTraverse!.uuid]).toBeDefined();
    });

    it("gives the duplicate a new refUuid when preserveRefUuid is false", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Source Traverse" });
      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });

      let newTraverse: Traverse | undefined;
      withMissionChange((m) => {
        newTraverse = applyDuplicateTraverse(m, {
          traverseUuid: traverse.uuid,
          preserveRefUuid: false,
        });
      });

      expect(newTraverse!.refUuid).not.toBe(traverse.refUuid);
    });

    it("preserves the source refUuid when preserveRefUuid is true", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Source Traverse" });
      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });

      let newTraverse: Traverse | undefined;
      withMissionChange((m) => {
        newTraverse = applyDuplicateTraverse(m, {
          traverseUuid: traverse.uuid,
          preserveRefUuid: true,
        });
      });

      expect(newTraverse!.refUuid).toBe(traverse.refUuid);
    });

    it("copies the traverse name from the source", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Named Traverse" });
      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });

      let newTraverse: Traverse | undefined;
      withMissionChange((m) => {
        newTraverse = applyDuplicateTraverse(m, {
          traverseUuid: traverse.uuid,
          preserveRefUuid: false,
        });
      });

      expect(newTraverse!.name).toBe("Vitest Named Traverse");
    });

    it("duplicates actions belonging to the source traverse onto the new traverse", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Traverse With Actions" });
      const action1 = generateBlankAction({ traverseUuid: traverse.uuid, name: "Action A" });
      const action2 = generateBlankAction({ traverseUuid: traverse.uuid, name: "Action B" });
      traverse.actionOrderUuids = [action1.uuid, action2.uuid];

      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
        m.actions[action1.uuid] = action1;
        m.actions[action2.uuid] = action2;
      });

      let newTraverse: Traverse | undefined;
      withMissionChange((m) => {
        newTraverse = applyDuplicateTraverse(m, {
          traverseUuid: traverse.uuid,
          preserveRefUuid: false,
        });
      });

      const doc = getMissionDocHandle().doc();
      const newActions = Object.values(doc.actions).filter(
        (a) => a.traverseUuid === newTraverse!.uuid
      );
      expect(newActions).toHaveLength(2);
      expect(newActions.map((a) => a.name).sort()).toEqual(["Action A", "Action B"]);
      // Each duplicated action must have a brand-new uuid and refUuid
      expect(newActions.map((a) => a.uuid)).not.toContain(action1.uuid);
      expect(newActions.map((a) => a.uuid)).not.toContain(action2.uuid);
      expect(newActions.map((a) => a.refUuid)).not.toContain(action1.refUuid);
      expect(newActions.map((a) => a.refUuid)).not.toContain(action2.refUuid);
    });

    it("copies actionOrderUuids to the new traverse in order with new action uuids", () => {
      const traverse = generateBlankTraverse({ name: "Vitest Ordered Traverse" });
      const action1 = generateBlankAction({ traverseUuid: traverse.uuid, name: "First" });
      const action2 = generateBlankAction({ traverseUuid: traverse.uuid, name: "Second" });
      traverse.actionOrderUuids = [action1.uuid, action2.uuid];

      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
        m.actions[action1.uuid] = action1;
        m.actions[action2.uuid] = action2;
      });

      let newTraverse: Traverse | undefined;
      withMissionChange((m) => {
        newTraverse = applyDuplicateTraverse(m, {
          traverseUuid: traverse.uuid,
          preserveRefUuid: false,
        });
      });

      const doc = getMissionDocHandle().doc();
      const newOrderUuids = doc.traverses[newTraverse!.uuid].actionOrderUuids;

      // Should have the same count as the source
      expect(newOrderUuids).toHaveLength(2);

      // The uuids in the order list must be brand-new (not the originals)
      expect(newOrderUuids).not.toContain(action1.uuid);
      expect(newOrderUuids).not.toContain(action2.uuid);

      // The order must match the source order: First before Second
      const newAction1 = doc.actions[newOrderUuids[0]];
      const newAction2 = doc.actions[newOrderUuids[1]];
      expect(newAction1?.name).toBe("First");
      expect(newAction2?.name).toBe("Second");
    });

    it("does not modify the original traverse", () => {
      const traverse = generateBlankTraverse({
        name: "Vitest Original",
        description: "original description",
        duration: 42,
        color: "#ff0000",
        status: null,
        path: [{ lat: 1, lng: 2 }],
        pathSegmentDistances: [100],
        pathSegmentElevations: [[10, 20]],
        pathSegmentAbsoluteSlopes: [[1, 2]],
      });
      getMissionDocHandle().change((m) => {
        m.traverses[traverse.uuid] = traverse;
      });

      withMissionChange((m) => {
        applyDuplicateTraverse(m, { traverseUuid: traverse.uuid, preserveRefUuid: false });
      });

      const doc = getMissionDocHandle().doc();
      expect(doc.traverses[traverse.uuid]).toEqual(traverse);
    });
  });

  describe("applyDeleteTraverses()", () => {
    describe("REX entries cleanup", () => {
      it("removes matching entries from rex.traverseEntries and leaves other entries intact", () => {
        const traverseA = generateBlankTraverse({ name: "Vitest Traverse A" });
        const traverseB = generateBlankTraverse({ name: "Vitest Traverse B" });
        const stationUuid = uuidv4();
        const actionUuid = uuidv4();
        const rex = generateBlankRex({ evaUuid: uuidv4() });
        rex.traverseEntries = {
          [traverseA.uuid]: { rexStatus: "in-progress" },
          [traverseB.uuid]: { rexStatus: "pending" },
        };
        rex.stationEntries = { [stationUuid]: { rexStatus: "pending" } };
        rex.actionEntries = { [actionUuid]: { rexStatus: "complete", mass: 5 } };
        getMissionDocHandle().change((m) => {
          m.traverses[traverseA.uuid] = traverseA;
          m.traverses[traverseB.uuid] = traverseB;
          m.rexes[rex.uuid] = rex;
        });

        withMissionChange((m) => applyDeleteTraverses(m, [traverseA.uuid]));

        const updatedRex = getMission().rexes[rex.uuid];
        expect(updatedRex.traverseEntries?.[traverseA.uuid]).toBeUndefined();
        expect(updatedRex.traverseEntries?.[traverseB.uuid]).toBeDefined();
        expect(updatedRex.traverseEntries?.[traverseB.uuid].rexStatus).toBe("pending");
        // unrelated entries untouched
        expect(updatedRex.stationEntries?.[stationUuid]).toBeDefined();
        expect(updatedRex.actionEntries?.[actionUuid]).toBeDefined();
      });

      it("cleans up matching traverseEntries across multiple rexes", () => {
        const traverseA = generateBlankTraverse({ name: "Vitest Traverse A" });
        const rex1 = generateBlankRex({ evaUuid: uuidv4() });
        rex1.traverseEntries = { [traverseA.uuid]: { rexStatus: "in-progress" } };
        const rex2 = generateBlankRex({ evaUuid: uuidv4() });
        rex2.traverseEntries = { [traverseA.uuid]: { rexStatus: "pending" } };
        getMissionDocHandle().change((m) => {
          m.traverses[traverseA.uuid] = traverseA;
          m.rexes[rex1.uuid] = rex1;
          m.rexes[rex2.uuid] = rex2;
        });

        withMissionChange((m) => applyDeleteTraverses(m, [traverseA.uuid]));

        expect(getMission().rexes[rex1.uuid].traverseEntries?.[traverseA.uuid]).toBeUndefined();
        expect(getMission().rexes[rex2.uuid].traverseEntries?.[traverseA.uuid]).toBeUndefined();
      });

      it("does not throw when rex.traverseEntries is null", () => {
        const traverseA = generateBlankTraverse({ name: "Vitest Traverse A" });
        const rex = generateBlankRex({ evaUuid: uuidv4() });
        rex.traverseEntries = null;
        getMissionDocHandle().change((m) => {
          m.traverses[traverseA.uuid] = traverseA;
          m.rexes[rex.uuid] = rex;
        });

        expect(() =>
          withMissionChange((m) => applyDeleteTraverses(m, [traverseA.uuid]))
        ).not.toThrow();
        expect(getMission().traverses[traverseA.uuid]).toBeUndefined();
        expect(getMission().rexes[rex.uuid].traverseEntries).toBeNull();
      });
    });
  });
});
