import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateMissionPriority,
  applyCreateMissionPriorityCategory,
  applyDeleteMissionPriority,
  applyDeleteMissionPriorityCategory,
  applyRenameMissionPriorityCategory,
  applyUpdateMissionPriorityByField,
  getMissionPriorityCategories,
  missionPriorityCategoryExists,
} from "operations/apply/apply-mission-priority";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.missionPriorities = {};
    m.actions = {};
    m.actionTemplates = {};
    m.stations = {};
    m.pois = {};
  });
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-mission-priority", () => {
  describe("applyCreateMissionPriorityCategory()", () => {
    it("creates the category by inserting one placeholder trace row", () => {
      withMissionChange((m) =>
        applyCreateMissionPriorityCategory(m, { category: "Vitest Category" })
      );

      const missionPriorities = getMissionDocHandle().doc().missionPriorities;
      expect(Object.keys(missionPriorities)).toHaveLength(1);
      expect(Object.values(missionPriorities)[0]).toEqual({
        trace: "(Trace)",
        category: "Vitest Category",
      });
    });
  });

  describe("applyCreateMissionPriority()", () => {
    it("adds another trace row to an existing category", () => {
      withMissionChange((m) =>
        applyCreateMissionPriorityCategory(m, { category: "Vitest Category" })
      );
      withMissionChange((m) => applyCreateMissionPriority(m, { category: "Vitest Category" }));

      const missionPriorities = getMissionDocHandle().doc().missionPriorities;
      expect(Object.keys(missionPriorities)).toHaveLength(2);
      expect(getMissionPriorityCategories({ missionPriorities })).toEqual(["Vitest Category"]);
    });

    it("returns the newly allocated uuid", () => {
      const uuid = withMissionChange((m) =>
        applyCreateMissionPriority(m, { category: "Vitest Category" })
      );

      expect(getMissionDocHandle().doc().missionPriorities[uuid]).toBeDefined();
    });
  });

  describe("applyUpdateMissionPriorityByField()", () => {
    it("updates the trace", () => {
      const uuid = withMissionChange((m) =>
        applyCreateMissionPriority(m, { category: "Vitest Category" })
      );

      withMissionChange((m) =>
        applyUpdateMissionPriorityByField(m, {
          missionPriorityUuid: uuid,
          fieldName: "trace",
          value: "SIMD-0005.1",
        })
      );

      expect(getMissionDocHandle().doc().missionPriorities[uuid].trace).toBe("SIMD-0005.1");
    });

    it("does nothing when the uuid does not exist", () => {
      withMissionChange((m) =>
        applyUpdateMissionPriorityByField(m, {
          missionPriorityUuid: uuidv4(),
          fieldName: "trace",
          value: "SIMD-0005.1",
        })
      );

      expect(Object.keys(getMissionDocHandle().doc().missionPriorities)).toHaveLength(0);
    });
  });

  describe("applyRenameMissionPriorityCategory()", () => {
    it("rewrites the category on every row that carries it", () => {
      withMissionChange((m) => {
        applyCreateMissionPriority(m, { category: "Vitest Category" });
        applyCreateMissionPriority(m, { category: "Vitest Category" });
        applyCreateMissionPriority(m, { category: "Vitest Other" });
      });

      withMissionChange((m) =>
        applyRenameMissionPriorityCategory(m, {
          fromCategory: "Vitest Category",
          toCategory: "Vitest Renamed",
        })
      );

      const missionPriorities = getMissionDocHandle().doc().missionPriorities;
      expect(getMissionPriorityCategories({ missionPriorities })).toEqual([
        "Vitest Other",
        "Vitest Renamed",
      ]);
    });
  });

  describe("missionPriorityCategoryExists()", () => {
    it("matches case-insensitively", () => {
      withMissionChange((m) => applyCreateMissionPriority(m, { category: "Vitest Category" }));
      const missionPriorities = getMissionDocHandle().doc().missionPriorities;

      expect(missionPriorityCategoryExists({ missionPriorities }, "vitest category")).toBe(true);
      expect(missionPriorityCategoryExists({ missionPriorities }, "Vitest Other")).toBe(false);
    });
  });

  describe("applyDeleteMissionPriority()", () => {
    it("removes the row", () => {
      const uuid = withMissionChange((m) =>
        applyCreateMissionPriority(m, { category: "Vitest Category" })
      );

      withMissionChange((m) => applyDeleteMissionPriority(m, { missionPriorityUuid: uuid }));

      expect(getMissionDocHandle().doc().missionPriorities[uuid]).toBeUndefined();
    });

    it("clears the reference from actions and templates", () => {
      const uuid = withMissionChange((m) =>
        applyCreateMissionPriority(m, { category: "Vitest Category" })
      );
      const action = generateBlankAction({ name: "Vitest A1", missionPriorityUuid: uuid });
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({
        templateName: "Vitest Template",
        missionPriorityUuid: uuid,
      });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) => applyDeleteMissionPriority(m, { missionPriorityUuid: uuid }));

      const doc = getMissionDocHandle().doc();
      expect(doc.actions[action.uuid].missionPriorityUuid).toBeNull();
      expect(doc.actionTemplates[templateUuid].missionPriorityUuid).toBeNull();
    });
  });

  describe("applyDeleteMissionPriorityCategory()", () => {
    it("removes every row in the category and leaves the others alone", () => {
      withMissionChange((m) => {
        applyCreateMissionPriority(m, { category: "Vitest Category" });
        applyCreateMissionPriority(m, { category: "Vitest Category" });
        applyCreateMissionPriority(m, { category: "Vitest Other" });
      });

      withMissionChange((m) =>
        applyDeleteMissionPriorityCategory(m, { category: "Vitest Category" })
      );

      const missionPriorities = getMissionDocHandle().doc().missionPriorities;
      expect(Object.keys(missionPriorities)).toHaveLength(1);
      expect(getMissionPriorityCategories({ missionPriorities })).toEqual(["Vitest Other"]);
    });
  });
});
