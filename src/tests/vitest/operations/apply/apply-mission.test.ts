import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyUpdateMissionByField } from "operations/apply/apply-mission";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.circleDefinitions = {};
    m.pois = {};
    m.actions = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-mission", () => {
  describe("applyUpdateMissionByField()", () => {
    it("updates a top-level string field", () => {
      const missionDocHandle = getMissionDocHandle();

      withMissionChange((m) =>
        applyUpdateMissionByField(m, { fieldName: "name", value: "Vitest New Mission Name" })
      );

      expect(missionDocHandle.doc().name).toBe("Vitest New Mission Name");
    });

    it("updates a top-level number field", () => {
      const missionDocHandle = getMissionDocHandle();

      withMissionChange((m) =>
        applyUpdateMissionByField(m, { fieldName: "traverseRate", value: 5 })
      );

      expect(missionDocHandle.doc().traverseRate).toBe(5);
    });

    it("updates a top-level object field", () => {
      const missionDocHandle = getMissionDocHandle();
      const newLocation: AEGISPoint = { lat: 10.5, lng: -20.3 };

      withMissionChange((m) =>
        applyUpdateMissionByField(m, { fieldName: "landerLocation", value: newLocation })
      );

      expect(missionDocHandle.doc().landerLocation).toEqual(newLocation);
    });

    it("updates mission updatedAt by default", () => {
      const missionDocHandle = getMissionDocHandle();
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateMissionByField(m, { fieldName: "name", value: "Vitest Updated" })
      );

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });

    it("updates a nested map field (circleDefinitions)", () => {
      const missionDocHandle = getMissionDocHandle();
      const circleDefUuid = uuidv4();
      const circleDef: CircleDefinition = { name: "Vitest Test Circle", radius: 15 };

      withMissionChange((m) =>
        applyUpdateMissionByField(m, {
          fieldName: "circleDefinitions",
          mapKey: circleDefUuid,
          mapValue: circleDef,
        })
      );

      expect(missionDocHandle.doc().circleDefinitions[circleDefUuid]).toEqual(circleDef);
    });

    it("initializes a null map field before inserting nested value", () => {
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.circleDefinitions = null;
      });
      const circleDefUuid = uuidv4();
      const circleDef: CircleDefinition = { name: "Vitest Auto-Init Circle", radius: 20 };

      withMissionChange((m) =>
        applyUpdateMissionByField(m, {
          fieldName: "circleDefinitions",
          mapKey: circleDefUuid,
          mapValue: circleDef,
        })
      );

      expect(missionDocHandle.doc().circleDefinitions[circleDefUuid]).toEqual(circleDef);
    });

    it("does not update updatedAt when preserveUpdatedAt is true for nested update", () => {
      const missionDocHandle = getMissionDocHandle();
      const originalUpdatedAt = missionDocHandle.doc().updatedAt;
      const circleDefUuid = uuidv4();

      withMissionChange((m) =>
        applyUpdateMissionByField(m, {
          fieldName: "circleDefinitions",
          mapKey: circleDefUuid,
          mapValue: { name: "Vitest c", radius: 5 },
          preserveUpdatedAt: true,
        })
      );

      expect(missionDocHandle.doc().updatedAt).toBe(originalUpdatedAt);
    });
  });
});
