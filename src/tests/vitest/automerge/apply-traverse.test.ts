import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyUpdateTraverseByField } from "client/automerge/apply/apply-traverse";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.traverses = {};
    m.actions = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-traverse", () => {
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
});
