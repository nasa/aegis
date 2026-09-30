import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateCircleDefinition,
  applyDeleteCircleDefinition,
  applyUpdateCircleDefinitionByField,
} from "operations/apply/apply-mission-circleDefinition";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.circleDefinitions = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-mission-circleDefinition", () => {
  describe("applyCreateCircleDefinition()", () => {
    it("adds a new circle definition to the mission", () => {
      withMissionChange((m) => applyCreateCircleDefinition(m));

      const doc = getMissionDocHandle().doc();
      expect(Object.keys(doc.circleDefinitions)).toHaveLength(1);
    });

    it("returns the uuid of the created circle definition", () => {
      const uuid = withMissionChange((m) => applyCreateCircleDefinition(m));

      expect(typeof uuid).toBe("string");
      expect(uuid.length).toBeGreaterThan(0);
    });

    it("creates circle definition with default name and radius", () => {
      const uuid = withMissionChange((m) => applyCreateCircleDefinition(m));

      const circleDef = getMissionDocHandle().doc().circleDefinitions[uuid];
      expect(circleDef.name).toBe("(Circle Definition Name)");
      expect(circleDef.radius).toBe(10);
    });

    it("updates mission updatedAt", () => {
      const missionDocHandle = getMissionDocHandle();
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) => applyCreateCircleDefinition(m));

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });
  });

  describe("applyDeleteCircleDefinition()", () => {
    it("removes the specified circle definition", () => {
      const uuid = withMissionChange((m) => applyCreateCircleDefinition(m));

      withMissionChange((m) => applyDeleteCircleDefinition(m, { circleDefUuid: uuid }));

      expect(getMissionDocHandle().doc().circleDefinitions[uuid]).toBeUndefined();
    });

    it("does not remove other circle definitions", () => {
      const uuid1 = withMissionChange((m) => applyCreateCircleDefinition(m));
      const uuid2 = withMissionChange((m) => applyCreateCircleDefinition(m));

      withMissionChange((m) => applyDeleteCircleDefinition(m, { circleDefUuid: uuid1 }));

      expect(getMissionDocHandle().doc().circleDefinitions[uuid2]).toBeDefined();
    });

    it("does nothing when uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) => applyDeleteCircleDefinition(m, { circleDefUuid: uuidv4() }))
      ).not.toThrow();
    });

    it("updates mission updatedAt on delete", () => {
      const uuid = withMissionChange((m) => applyCreateCircleDefinition(m));
      const missionDocHandle = getMissionDocHandle();
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) => applyDeleteCircleDefinition(m, { circleDefUuid: uuid }));

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });
  });

  describe("applyUpdateCircleDefinitionByField()", () => {
    it("updates the name of an existing circle definition", () => {
      const uuid = withMissionChange((m) => applyCreateCircleDefinition(m));

      withMissionChange((m) =>
        applyUpdateCircleDefinitionByField(m, {
          circleDefUuid: uuid,
          fieldName: "name",
          value: "Updated Circle",
        })
      );

      expect(getMissionDocHandle().doc().circleDefinitions[uuid].name).toBe("Updated Circle");
    });

    it("updates the radius of an existing circle definition", () => {
      const uuid = withMissionChange((m) => applyCreateCircleDefinition(m));

      withMissionChange((m) =>
        applyUpdateCircleDefinitionByField(m, {
          circleDefUuid: uuid,
          fieldName: "radius",
          value: 25,
        })
      );

      expect(getMissionDocHandle().doc().circleDefinitions[uuid].radius).toBe(25);
    });

    it("updates mission updatedAt", () => {
      const uuid = withMissionChange((m) => applyCreateCircleDefinition(m));
      const missionDocHandle = getMissionDocHandle();
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateCircleDefinitionByField(m, {
          circleDefUuid: uuid,
          fieldName: "name",
          value: "New Name",
        })
      );

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });

    it("does nothing when circle definition uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateCircleDefinitionByField(m, {
            circleDefUuid: uuidv4(),
            fieldName: "name",
            value: "x",
          })
        )
      ).not.toThrow();
    });
  });
});
