import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateActionDefinitionItem,
  applyUpdateActionDefinitionItemByField,
} from "operations/apply/apply-mission-actionDefinition";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-mission-actionDefinition", () => {
  describe("applyCreateActionDefinitionItem()", () => {
    it("creates a new verb item with placeholder name", () => {
      const missionDocHandle = getMissionDocHandle();
      const verbCountBefore = Object.keys(missionDocHandle.doc().actionDefinitions.verbs).length;

      withMissionChange((m) => applyCreateActionDefinitionItem(m, { type: "verbs" }));

      const verbs = missionDocHandle.doc().actionDefinitions.verbs;
      expect(Object.keys(verbs).length).toBe(verbCountBefore + 1);

      const newVerb = Object.values(verbs).find((v) => v.name === "(Verb Name)");
      expect(newVerb).toBeDefined();
      expect(newVerb.abbr).toBe("abbr");
    });

    it("creates a new noun item with placeholder name", () => {
      const missionDocHandle = getMissionDocHandle();
      const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions.nouns).length;

      withMissionChange((m) => applyCreateActionDefinitionItem(m, { type: "nouns" }));

      const nouns = missionDocHandle.doc().actionDefinitions.nouns;
      expect(Object.keys(nouns).length).toBe(countBefore + 1);

      const newNoun = Object.values(nouns).find((n) => n.name === "(Noun Name)");
      expect(newNoun).toBeDefined();
    });

    it("creates a new adjective item with placeholder name", () => {
      const missionDocHandle = getMissionDocHandle();
      const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions.adjectives).length;

      withMissionChange((m) => applyCreateActionDefinitionItem(m, { type: "adjectives" }));

      const adjectives = missionDocHandle.doc().actionDefinitions.adjectives;
      expect(Object.keys(adjectives).length).toBe(countBefore + 1);

      const newAdj = Object.values(adjectives).find((a) => a.name === "(Adjective Name)");
      expect(newAdj).toBeDefined();
    });

    it("updates mission updatedAt", () => {
      const missionDocHandle = getMissionDocHandle();
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) => applyCreateActionDefinitionItem(m, { type: "verbs" }));

      const after = missionDocHandle.doc().updatedAt;
      expect(after).toBeGreaterThan(before);
    });
  });

  describe("applyUpdateActionDefinitionItemByField()", () => {
    it("updates the name of an existing verb item", () => {
      const missionDocHandle = getMissionDocHandle();
      const verbUuid = Object.keys(missionDocHandle.doc().actionDefinitions.verbs)[0];

      withMissionChange((m) =>
        applyUpdateActionDefinitionItemByField(m, {
          type: "verbs",
          uuid: verbUuid,
          fieldName: "name",
          value: "Renamed Verb",
        })
      );

      expect(missionDocHandle.doc().actionDefinitions.verbs[verbUuid].name).toBe("Renamed Verb");
    });

    it("updates the abbr of an existing noun item", () => {
      const missionDocHandle = getMissionDocHandle();
      const nounUuid = Object.keys(missionDocHandle.doc().actionDefinitions.nouns)[0];

      withMissionChange((m) =>
        applyUpdateActionDefinitionItemByField(m, {
          type: "nouns",
          uuid: nounUuid,
          fieldName: "abbr",
          value: "rnoun",
        })
      );

      expect(missionDocHandle.doc().actionDefinitions.nouns[nounUuid].abbr).toBe("rnoun");
    });

    it("updates mission updatedAt", () => {
      const missionDocHandle = getMissionDocHandle();
      const verbUuid = Object.keys(missionDocHandle.doc().actionDefinitions.verbs)[0];
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateActionDefinitionItemByField(m, {
          type: "verbs",
          uuid: verbUuid,
          fieldName: "name",
          value: "New Name",
        })
      );

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });

    it("does nothing when the item uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateActionDefinitionItemByField(m, {
            type: "verbs",
            uuid: "nonexistent-uuid",
            fieldName: "name",
            value: "x",
          })
        )
      ).not.toThrow();
    });
  });
});
