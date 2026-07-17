import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateAction,
  applyDeleteActionAndUpdateParent,
  applyDeleteActions,
  applyDuplicateActions,
  applyUpdateActionByField,
  applyUpdateActionDefinitionSelection,
} from "client/automerge/apply/apply-action";
import { getHighlightedActions } from "store/selectors";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.actions = {};
    m.stations = {};
    m.traverses = {};
    m.pois = {};
    m.rexes = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-action", () => {
  describe("applyCreateAction()", () => {
    it("adds a new action to the automerge doc", () => {
      const stationUuid = uuidv4();
      getMissionDocHandle().change((m) => {
        m.stations[stationUuid] = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [] });
      });
      const uuid = withMissionChange((m) =>
        applyCreateAction(m, {
          actionParentUuid: { stationUuid },
        })
      );

      const doc = getMissionDocHandle().doc();
      expect(doc.actions[uuid]).toBeDefined();
    });

    it("generates a unique name when there are existing actions", () => {
      const existingAction = generateBlankAction({ name: "Vitest Existing Action" });
      getMissionDocHandle().change((m) => {
        m.actions[existingAction.uuid] = existingAction;
      });

      const stationUuid = uuidv4();
      const newUuid = withMissionChange((m) =>
        applyCreateAction(m, {
          actionParentUuid: { stationUuid },
        })
      );

      const doc = getMissionDocHandle().doc();
      expect(doc.actions[newUuid]).toBeDefined();
      // The new action should have a different name than the existing one
      expect(doc.actions[newUuid].name).not.toBe(existingAction.name);
    });

    it("appends the new action uuid to the parent's actionOrderUuids in the automerge doc", () => {
      const stationUuid = uuidv4();
      const existing = uuidv4();
      getMissionDocHandle().change((m) => {
        m.stations[stationUuid] = generateBlankStation({
          uuid: stationUuid,
          actionOrderUuids: [existing],
        });
      });

      const newUuid = withMissionChange((m) =>
        applyCreateAction(m, {
          actionParentUuid: { stationUuid },
        })
      );

      const doc = getMissionDocHandle().doc();
      expect(doc.stations[stationUuid].actionOrderUuids).toEqual([existing, newUuid]);
    });

    it("applies actionTemplate fields when a template is provided", () => {
      const template = generateBlankActionTemplate({
        name: "Vitest Template Action",
        description: "from template",
      });
      const uuid = withMissionChange((m) =>
        applyCreateAction(m, {
          actionParentUuid: { stationUuid: uuidv4() },
          actionTemplate: template,
        })
      );

      const doc = getMissionDocHandle().doc();
      expect(doc.actions[uuid].name).toBe("Vitest Template Action");
      expect(doc.actions[uuid].description).toBe("from template");
    });

    it("returns the uuid of the created action", () => {
      const uuid = withMissionChange((m) =>
        applyCreateAction(m, {
          actionParentUuid: { poiUuid: uuidv4() },
        })
      );
      expect(typeof uuid).toBe("string");
      expect(uuid.length).toBeGreaterThan(0);
    });
  });

  describe("applyUpdateActionByField()", () => {
    it("updates the specified field on an existing action", () => {
      const action = generateBlankAction({ name: "Vitest Original Name" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
      });

      withMissionChange((m) =>
        applyUpdateActionByField(m, {
          actionUuid: action.uuid,
          fieldName: "name",
          value: "Vitest Updated Name",
        })
      );

      expect(missionDocHandle.doc().actions[action.uuid].name).toBe("Vitest Updated Name");
    });

    it("updates updatedAt by default", () => {
      const action = generateBlankAction({ name: "Vitest Action" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
      });
      const originalUpdatedAt = missionDocHandle.doc().actions[action.uuid].updatedAt;

      // Wait a bit to ensure time changes
      const laterTime = originalUpdatedAt + 10;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(laterTime);

      withMissionChange((m) =>
        applyUpdateActionByField(m, {
          actionUuid: action.uuid,
          fieldName: "name",
          value: "Vitest New Name",
        })
      );
      // updatedAt should have been set (it's set to getAccurateNow().getTime())
      const updatedDoc = missionDocHandle.doc().actions[action.uuid];
      expect(updatedDoc.updatedAt).toBe(laterTime);
      expect(updatedDoc.name).toBe("Vitest New Name");
    });

    it("does not change updatedAt when preserveUpdatedAt is true", () => {
      const action = generateBlankAction({ name: "Vitest Action" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
      });
      const originalUpdatedAt = missionDocHandle.doc().actions[action.uuid].updatedAt;

      withMissionChange((m) =>
        applyUpdateActionByField(m, {
          actionUuid: action.uuid,
          fieldName: "name",
          value: "Vitest New Name",
          preserveUpdatedAt: true,
        })
      );

      expect(missionDocHandle.doc().actions[action.uuid].updatedAt).toBe(originalUpdatedAt);
    });

    it("does nothing when action does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateActionByField(m, { actionUuid: uuidv4(), fieldName: "name", value: "x" })
        )
      ).not.toThrow();
    });
  });

  describe("applyDeleteActions()", () => {
    it("deletes specified actions from the automerge doc", () => {
      const action1 = generateBlankAction({ name: "Vitest Action 1" });
      const action2 = generateBlankAction({ name: "Vitest Action 2" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action1.uuid] = action1;
        m.actions[action2.uuid] = action2;
      });

      withMissionChange((m) => applyDeleteActions(m, [action1.uuid]));

      const doc = missionDocHandle.doc();
      expect(doc.actions[action1.uuid]).toBeUndefined();
      expect(doc.actions[action2.uuid]).toBeDefined();
    });

    it("deletes multiple actions at once", () => {
      const action1 = generateBlankAction({ name: "Vitest Action 1" });
      const action2 = generateBlankAction({ name: "Vitest Action 2" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action1.uuid] = action1;
        m.actions[action2.uuid] = action2;
      });

      withMissionChange((m) => applyDeleteActions(m, [action1.uuid, action2.uuid]));

      const doc = missionDocHandle.doc();
      expect(doc.actions[action1.uuid]).toBeUndefined();
      expect(doc.actions[action2.uuid]).toBeUndefined();
    });

    describe("REX entries cleanup", () => {
      it("removes matching entries from rex.actionEntries and leaves other entries intact", () => {
        const actionA = generateBlankAction({ name: "Vitest Action A" });
        const actionB = generateBlankAction({ name: "Vitest Action B" });
        const stationUuid = uuidv4();
        const traverseUuid = uuidv4();
        const rex = generateBlankRex({ evaUuid: uuidv4() });
        rex.actionEntries = {
          [actionA.uuid]: { rexStatus: "complete", mass: 5 },
          [actionB.uuid]: { rexStatus: "pending", mass: null },
        };
        rex.stationEntries = { [stationUuid]: { rexStatus: "pending" } };
        rex.traverseEntries = { [traverseUuid]: { rexStatus: "in-progress" } };
        getMissionDocHandle().change((m) => {
          m.actions[actionA.uuid] = actionA;
          m.actions[actionB.uuid] = actionB;
          m.rexes[rex.uuid] = rex;
        });

        withMissionChange((m) => applyDeleteActions(m, [actionA.uuid]));

        const updatedRex = getMissionDocHandle().doc().rexes[rex.uuid];
        expect(updatedRex.actionEntries?.[actionA.uuid]).toBeUndefined();
        expect(updatedRex.actionEntries?.[actionB.uuid]).toBeDefined();
        expect(updatedRex.actionEntries?.[actionB.uuid].rexStatus).toBe("pending");
        // unrelated entries untouched
        expect(updatedRex.stationEntries?.[stationUuid]).toBeDefined();
        expect(updatedRex.traverseEntries?.[traverseUuid]).toBeDefined();
      });

      it("cleans up matching actionEntries across multiple rexes", () => {
        const actionA = generateBlankAction({ name: "Vitest Action A" });
        const rex1 = generateBlankRex({ evaUuid: uuidv4() });
        rex1.actionEntries = { [actionA.uuid]: { rexStatus: "complete", mass: 5 } };
        const rex2 = generateBlankRex({ evaUuid: uuidv4() });
        rex2.actionEntries = { [actionA.uuid]: { rexStatus: "pending", mass: null } };
        getMissionDocHandle().change((m) => {
          m.actions[actionA.uuid] = actionA;
          m.rexes[rex1.uuid] = rex1;
          m.rexes[rex2.uuid] = rex2;
        });

        withMissionChange((m) => applyDeleteActions(m, [actionA.uuid]));

        const doc = getMissionDocHandle().doc();
        expect(doc.rexes[rex1.uuid].actionEntries?.[actionA.uuid]).toBeUndefined();
        expect(doc.rexes[rex2.uuid].actionEntries?.[actionA.uuid]).toBeUndefined();
      });

      it("does not throw when rex.actionEntries is null", () => {
        const actionA = generateBlankAction({ name: "Vitest Action A" });
        const rex = generateBlankRex({ evaUuid: uuidv4() });
        rex.actionEntries = null;
        getMissionDocHandle().change((m) => {
          m.actions[actionA.uuid] = actionA;
          m.rexes[rex.uuid] = rex;
        });

        expect(() => withMissionChange((m) => applyDeleteActions(m, [actionA.uuid]))).not.toThrow();
        const doc = getMissionDocHandle().doc();
        expect(doc.actions[actionA.uuid]).toBeUndefined();
        expect(doc.rexes[rex.uuid].actionEntries).toBeNull();
      });
    });
  });

  describe("applyUpdateActionDefinitionSelection()", () => {
    it("updates verbUuid on the action definition", () => {
      const verbUuid = uuidv4();
      const action = generateBlankAction({
        actionDefinition: { verbUuid: "", nounUuid: "", adjectiveUuid: "" },
      });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
      });

      withMissionChange((m) =>
        applyUpdateActionDefinitionSelection(m, {
          actionUuid: action.uuid,
          type: "verbs",
          typeUuid: verbUuid,
        })
      );

      expect(missionDocHandle.doc().actions[action.uuid].actionDefinition.verbUuid).toBe(verbUuid);
    });

    it("updates nounUuid on the action definition", () => {
      const nounUuid = uuidv4();
      const action = generateBlankAction({
        actionDefinition: { verbUuid: "", nounUuid: "", adjectiveUuid: "" },
      });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
      });

      withMissionChange((m) =>
        applyUpdateActionDefinitionSelection(m, {
          actionUuid: action.uuid,
          type: "nouns",
          typeUuid: nounUuid,
        })
      );

      expect(missionDocHandle.doc().actions[action.uuid].actionDefinition.nounUuid).toBe(nounUuid);
    });

    it("updates adjectiveUuid on the action definition", () => {
      const adjUuid = uuidv4();
      const action = generateBlankAction({
        actionDefinition: { verbUuid: "", nounUuid: "", adjectiveUuid: "" },
      });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
      });

      withMissionChange((m) =>
        applyUpdateActionDefinitionSelection(m, {
          actionUuid: action.uuid,
          type: "adjectives",
          typeUuid: adjUuid,
        })
      );

      expect(missionDocHandle.doc().actions[action.uuid].actionDefinition.adjectiveUuid).toBe(
        adjUuid
      );
    });

    it("does nothing when action does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateActionDefinitionSelection(m, {
            actionUuid: uuidv4(),
            type: "verbs",
            typeUuid: uuidv4(),
          })
        )
      ).not.toThrow();
    });
  });

  describe("getHighlightedActions()", () => {
    it("returns highlight:false when action has no stmPriorities", () => {
      const stmUuid = uuidv4();
      const action = generateBlankAction({ stmPriorities: null });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
      });

      const highlights = getHighlightedActions({
        actionUuids: [action.uuid],
        stmUuid,
        actions: getMissionDocHandle().doc().actions,
      });

      expect(highlights).toHaveLength(1);
      expect(highlights[0]).toEqual({ uuid: action.uuid, highlight: false });
    });

    it("returns highlight:true when action stmPriorities contains the given stmUuid", () => {
      const stmUuid = uuidv4();
      const action = generateBlankAction({ stmPriorities: { [stmUuid]: 1 } });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
      });

      const highlights = getHighlightedActions({
        actionUuids: [action.uuid],
        stmUuid,
        actions: getMissionDocHandle().doc().actions,
      });

      expect(highlights[0].highlight).toBe(true);
    });

    it("returns highlight:false when stmPriorities does not contain the given stmUuid", () => {
      const stmUuid = uuidv4();
      const action = generateBlankAction({ stmPriorities: { [uuidv4()]: 1 } });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
      });

      const highlights = getHighlightedActions({
        actionUuids: [action.uuid],
        stmUuid,
        actions: getMissionDocHandle().doc().actions,
      });

      expect(highlights[0].highlight).toBe(false);
    });

    it("returns an empty array when no matching action uuids exist", () => {
      const highlights = getHighlightedActions({
        actionUuids: [uuidv4()],
        stmUuid: uuidv4(),
        actions: getMissionDocHandle().doc().actions,
      });
      expect(highlights).toHaveLength(0);
    });
  });

  describe("applyDuplicateActions()", () => {
    it("does nothing when actions array is empty", () => {
      const missionDocHandle = getMissionDocHandle();
      withMissionChange((m) =>
        applyDuplicateActions(m, { actions: [], preserveRefUuid: false, stationUuid: uuidv4() })
      );
      expect(Object.keys(missionDocHandle.doc().actions)).toHaveLength(0);
    });

    it("creates a duplicate action with a new uuid in automerge", () => {
      const stationUuid = uuidv4();
      const station = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [] });
      const action = generateBlankAction({ name: "Vitest Original Action", stationUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.stations[stationUuid] = station;
      });

      withMissionChange((m) =>
        applyDuplicateActions(m, { actions: [action], preserveRefUuid: false, stationUuid })
      );

      const allActions = Object.values(missionDocHandle.doc().actions);
      expect(allActions).toHaveLength(2);
      const duplicate = allActions.find((a) => a.uuid !== action.uuid);
      expect(duplicate).toBeDefined();
      expect(duplicate.stationUuid).toBe(stationUuid);
    });

    it("assigns new refUuid when preserveRefUuid is false", () => {
      const stationUuid = uuidv4();
      const station = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [] });
      const action = generateBlankAction({ stationUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.stations[stationUuid] = station;
      });

      withMissionChange((m) =>
        applyDuplicateActions(m, { actions: [action], preserveRefUuid: false, stationUuid })
      );

      const allActions = Object.values(missionDocHandle.doc().actions);
      const duplicate = allActions.find((a) => a.uuid !== action.uuid);
      expect(duplicate.refUuid).not.toBe(action.refUuid);
    });

    it("preserves refUuid when preserveRefUuid is true", () => {
      const stationUuid = uuidv4();
      const station = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [] });
      const action = generateBlankAction({ stationUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.stations[stationUuid] = station;
      });

      withMissionChange((m) =>
        applyDuplicateActions(m, { actions: [action], preserveRefUuid: true, stationUuid })
      );

      const allActions = Object.values(missionDocHandle.doc().actions);
      const duplicate = allActions.find((a) => a.uuid !== action.uuid);
      expect(duplicate.refUuid).toBe(action.refUuid);
    });

    it("appends duplicated action uuid to station actionOrderUuids", () => {
      const stationUuid = uuidv4();
      const station = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [] });
      const action = generateBlankAction({ stationUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.stations[stationUuid] = station;
      });

      withMissionChange((m) =>
        applyDuplicateActions(m, { actions: [action], preserveRefUuid: false, stationUuid })
      );

      const doc = missionDocHandle.doc();
      const newActionUuid = Object.keys(doc.actions).find((k) => k !== action.uuid);
      expect(doc.stations[stationUuid].actionOrderUuids).toContain(newActionUuid);
    });

    it("appends duplicated action uuid to poi actionOrderUuids", () => {
      const poiUuid = uuidv4();
      const poi = generateBlankPoi({ uuid: poiUuid, actionOrderUuids: [] });
      const action = generateBlankAction({ poiUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.pois[poiUuid] = poi;
      });

      withMissionChange((m) =>
        applyDuplicateActions(m, { actions: [action], preserveRefUuid: false, poiUuid })
      );

      const doc = missionDocHandle.doc();
      const newActionUuid = Object.keys(doc.actions).find((k) => k !== action.uuid);
      expect(doc.pois[poiUuid].actionOrderUuids).toContain(newActionUuid);
    });

    it("handles poi with null actionOrderUuids", () => {
      const poiUuid = uuidv4();
      const poi = generateBlankPoi({ uuid: poiUuid, actionOrderUuids: null });
      const action = generateBlankAction({ poiUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.pois[poiUuid] = poi;
      });

      expect(() =>
        withMissionChange((m) =>
          applyDuplicateActions(m, { actions: [action], preserveRefUuid: false, poiUuid })
        )
      ).not.toThrow();

      const doc = missionDocHandle.doc();
      const newActionUuid = Object.keys(doc.actions).find((k) => k !== action.uuid);
      expect(doc.pois[poiUuid].actionOrderUuids).toContain(newActionUuid);
    });

    it("sets parentActionUuid from original when promotingFromPoi is true", () => {
      const stationUuid = uuidv4();
      const station = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [] });
      const action = generateBlankAction({ stationUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.stations[stationUuid] = station;
      });

      withMissionChange((m) =>
        applyDuplicateActions(m, {
          actions: [action],
          preserveRefUuid: false,
          stationUuid,
          promotingFromPoi: true,
        })
      );

      const allActions = Object.values(missionDocHandle.doc().actions);
      const duplicate = allActions.find((a) => a.uuid !== action.uuid);
      expect(duplicate.parentActionUuid).toBe(action.uuid);
    });

    it("does nothing when actions is null", () => {
      const missionDocHandle = getMissionDocHandle();
      withMissionChange((m) => applyDuplicateActions(m, { actions: null, preserveRefUuid: false }));
      expect(Object.keys(missionDocHandle.doc().actions)).toHaveLength(0);
    });

    it("appends duplicated action uuid to traverse actionOrderUuids", () => {
      const traverseUuid = uuidv4();
      const traverse = generateBlankTraverse({ uuid: traverseUuid, actionOrderUuids: [] });
      const action = generateBlankAction({ traverseUuid });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.traverses[traverseUuid] = traverse;
      });

      withMissionChange((m) =>
        applyDuplicateActions(m, { actions: [action], preserveRefUuid: false, traverseUuid })
      );

      const doc = missionDocHandle.doc();
      const newActionUuid = Object.keys(doc.actions).find((k) => k !== action.uuid);
      expect(doc.traverses[traverseUuid].actionOrderUuids).toContain(newActionUuid);
    });
  });

  describe("applyDeleteActionAndUpdateParent()", () => {
    it("deletes the action from automerge", () => {
      const stationUuid = uuidv4();
      const action = generateBlankAction({ stationUuid });
      const station = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [action.uuid] });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.stations[stationUuid] = station;
      });

      withMissionChange((m) => applyDeleteActionAndUpdateParent(m, { uuid: action.uuid }));

      expect(missionDocHandle.doc().actions[action.uuid]).toBeUndefined();
    });

    it("removes action uuid from parent station actionOrderUuids", () => {
      const stationUuid = uuidv4();
      const action = generateBlankAction({ stationUuid });
      const station = generateBlankStation({ uuid: stationUuid, actionOrderUuids: [action.uuid] });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.stations[stationUuid] = station;
      });

      withMissionChange((m) => applyDeleteActionAndUpdateParent(m, { uuid: action.uuid }));

      expect(missionDocHandle.doc().stations[stationUuid].actionOrderUuids).not.toContain(
        action.uuid
      );
    });

    it("removes action uuid from parent poi actionOrderUuids", () => {
      const poiUuid = uuidv4();
      const action = generateBlankAction({ poiUuid });
      const poi = generateBlankPoi({ uuid: poiUuid, actionOrderUuids: [action.uuid] });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.pois[poiUuid] = poi;
      });

      withMissionChange((m) => applyDeleteActionAndUpdateParent(m, { uuid: action.uuid }));

      expect(missionDocHandle.doc().pois[poiUuid].actionOrderUuids).not.toContain(action.uuid);
    });

    it("removes action uuid from parent traverse actionOrderUuids", () => {
      const traverseUuid = uuidv4();
      const action = generateBlankAction({ traverseUuid });
      const traverse = generateBlankTraverse({
        uuid: traverseUuid,
        actionOrderUuids: [action.uuid],
      });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actions[action.uuid] = action;
        m.traverses[traverseUuid] = traverse;
      });

      withMissionChange((m) => applyDeleteActionAndUpdateParent(m, { uuid: action.uuid }));

      expect(missionDocHandle.doc().traverses[traverseUuid].actionOrderUuids).not.toContain(
        action.uuid
      );
    });

    it("does nothing when the action does not exist", () => {
      expect(() =>
        withMissionChange((m) => applyDeleteActionAndUpdateParent(m, { uuid: uuidv4() }))
      ).not.toThrow();
    });

    describe("REX entries cleanup", () => {
      it("removes the corresponding entry from rex.actionEntries when deleting a single action", () => {
        const stationUuid = uuidv4();
        const action = generateBlankAction({ stationUuid });
        const otherActionUuid = uuidv4();
        const station = generateBlankStation({
          uuid: stationUuid,
          actionOrderUuids: [action.uuid],
        });
        const rex = generateBlankRex({ evaUuid: uuidv4() });
        rex.actionEntries = {
          [action.uuid]: { rexStatus: "complete", mass: 5 },
          [otherActionUuid]: { rexStatus: "pending", mass: null },
        };
        const missionDocHandle = getMissionDocHandle();
        missionDocHandle.change((m) => {
          m.actions[action.uuid] = action;
          m.stations[stationUuid] = station;
          m.rexes[rex.uuid] = rex;
        });

        withMissionChange((m) => applyDeleteActionAndUpdateParent(m, { uuid: action.uuid }));

        const updatedRex = missionDocHandle.doc().rexes[rex.uuid];
        expect(updatedRex.actionEntries?.[action.uuid]).toBeUndefined();
        // unrelated entry should still exist
        expect(updatedRex.actionEntries?.[otherActionUuid]).toBeDefined();
        expect(updatedRex.actionEntries?.[otherActionUuid].rexStatus).toBe("pending");
      });
    });
  });
});
