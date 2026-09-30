import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateActionTemplate,
  applyCreateTemplateFromAction,
  applyDeleteActionTemplate,
  applyDuplicateActionTemplate,
  applyUpdateActionTemplateActionDefinition,
  applyUpdateActionTemplateByField,
} from "operations/apply/apply-mission-actionTemplate";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.actionTemplates = {};
    m.actions = {};
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("apply-mission-actionTemplate", () => {
  describe("applyCreateActionTemplate()", () => {
    it("adds a new action template to the mission", () => {
      withMissionChange((m) => applyCreateActionTemplate(m));

      const doc = getMissionDocHandle().doc();
      expect(Object.keys(doc.actionTemplates)).toHaveLength(1);
    });

    it("assigns a non-null templateName to the new template", () => {
      withMissionChange((m) => applyCreateActionTemplate(m));

      const templates = Object.values(getMissionDocHandle().doc().actionTemplates);
      expect(templates[0].templateName).toBeTruthy();
    });

    it("updates mission updatedAt", () => {
      const missionDocHandle = getMissionDocHandle();
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) => applyCreateActionTemplate(m));

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });

    it("generates a unique name when templates already exist", () => {
      // Add a first template so the existingNames map callback processes a non-empty collection
      withMissionChange((m) => applyCreateActionTemplate(m));
      // Add a second template
      withMissionChange((m) => applyCreateActionTemplate(m));

      const allTemplates = Object.values(getMissionDocHandle().doc().actionTemplates);
      expect(allTemplates).toHaveLength(2);
      // Both names must be unique
      const names = allTemplates.map((t) => t.templateName);
      expect(new Set(names).size).toBe(2);
      expect(names[0]).not.toBe(names[1]);
    });
  });

  describe("applyDeleteActionTemplate()", () => {
    it("removes the specified action template", () => {
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({ templateName: "Vitest To Delete" });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) => applyDeleteActionTemplate(m, { actionTemplateUuid: templateUuid }));

      expect(getMissionDocHandle().doc().actionTemplates[templateUuid]).toBeUndefined();
    });

    it("does nothing when the template uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) => applyDeleteActionTemplate(m, { actionTemplateUuid: uuidv4() }))
      ).not.toThrow();
    });

    it("updates mission updatedAt on delete", () => {
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({ templateName: "Vitest Template" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actionTemplates[templateUuid] = template;
      });
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) => applyDeleteActionTemplate(m, { actionTemplateUuid: templateUuid }));

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });
  });

  describe("applyUpdateActionTemplateByField()", () => {
    it("updates a top-level field on an action template", () => {
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({ templateName: "Vitest Original" });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) =>
        applyUpdateActionTemplateByField(m, {
          actionTemplateUuid: templateUuid,
          fieldName: "templateName",
          value: "Vitest Updated",
        })
      );

      expect(getMissionDocHandle().doc().actionTemplates[templateUuid].templateName).toBe(
        "Vitest Updated"
      );
    });

    it("updates template updatedAt", () => {
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({ templateName: "Vitest Template" });
      const missionDocHandle = getMissionDocHandle();
      missionDocHandle.change((m) => {
        m.actionTemplates[templateUuid] = template;
      });
      const before = missionDocHandle.doc().actionTemplates[templateUuid].updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateActionTemplateByField(m, {
          actionTemplateUuid: templateUuid,
          fieldName: "name",
          value: "New Action Name",
        })
      );

      expect(missionDocHandle.doc().actionTemplates[templateUuid].updatedAt).toBeGreaterThan(
        before
      );
    });

    it("updates a nested map field when mapKey is provided", () => {
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({
        templateName: "Vitest Template",
        equipmentItemsUsage: {},
      });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
        // Pre-populate a key in equipmentItemsUsage so the map exists
        m.actionTemplates[templateUuid].equipmentItemsUsage = { "item-1": { quantityUsed: 1 } };
      });

      withMissionChange((m) =>
        applyUpdateActionTemplateByField(m, {
          actionTemplateUuid: templateUuid,
          fieldName: "equipmentItemsUsage",
          mapKey: "item-1",
          mapValue: { quantityUsed: 5 },
        })
      );

      const result = getMissionDocHandle().doc().actionTemplates[templateUuid].equipmentItemsUsage;
      expect(result["item-1"]).toEqual({ quantityUsed: 5 });
    });

    it("does nothing when template uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateActionTemplateByField(m, {
            actionTemplateUuid: uuidv4(),
            fieldName: "templateName",
            value: "x",
          })
        )
      ).not.toThrow();
    });
  });

  describe("applyDuplicateActionTemplate()", () => {
    it("creates a second template as a copy of the original", () => {
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({ templateName: "Vitest Original" });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) =>
        applyDuplicateActionTemplate(m, { actionTemplateUuid: templateUuid })
      );

      const templates = getMissionDocHandle().doc().actionTemplates;
      expect(Object.keys(templates)).toHaveLength(2);
    });

    it("gives the duplicate a unique template name", () => {
      const templateUuid = uuidv4();
      const template = generateBlankActionTemplate({ templateName: "Vitest Original" });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) =>
        applyDuplicateActionTemplate(m, { actionTemplateUuid: templateUuid })
      );

      const templates = Object.values(getMissionDocHandle().doc().actionTemplates);
      const names = templates.map((t) => t.templateName);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(2);
    });

    it("does nothing when the template uuid does not exist", () => {
      const missionDocHandle = getMissionDocHandle();
      withMissionChange((m) => applyDuplicateActionTemplate(m, { actionTemplateUuid: uuidv4() }));
      expect(Object.keys(missionDocHandle.doc().actionTemplates)).toHaveLength(0);
    });
  });

  describe("applyUpdateActionTemplateActionDefinition()", () => {
    it("sets verbUuid on the action template definition", () => {
      const templateUuid = uuidv4();
      const verbUuid = uuidv4();
      const template = generateBlankActionTemplate({
        templateName: "Vitest Template",
        actionDefinition: null,
      });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) =>
        applyUpdateActionTemplateActionDefinition(m, {
          actionTemplateUuid: templateUuid,
          type: "verbUuid",
          uuid: verbUuid,
        })
      );

      expect(
        getMissionDocHandle().doc().actionTemplates[templateUuid].actionDefinition.verbUuid
      ).toBe(verbUuid);
    });

    it("sets nounUuid on the action template definition", () => {
      const templateUuid = uuidv4();
      const nounUuid = uuidv4();
      const template = generateBlankActionTemplate({
        templateName: "Vitest Template",
        actionDefinition: null,
      });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) =>
        applyUpdateActionTemplateActionDefinition(m, {
          actionTemplateUuid: templateUuid,
          type: "nounUuid",
          uuid: nounUuid,
        })
      );

      expect(
        getMissionDocHandle().doc().actionTemplates[templateUuid].actionDefinition.nounUuid
      ).toBe(nounUuid);
    });

    it("sets adjectiveUuid on the action template definition", () => {
      const templateUuid = uuidv4();
      const adjUuid = uuidv4();
      const template = generateBlankActionTemplate({
        templateName: "Vitest Template",
        actionDefinition: null,
      });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) =>
        applyUpdateActionTemplateActionDefinition(m, {
          actionTemplateUuid: templateUuid,
          type: "adjectiveUuid",
          uuid: adjUuid,
        })
      );

      expect(
        getMissionDocHandle().doc().actionTemplates[templateUuid].actionDefinition.adjectiveUuid
      ).toBe(adjUuid);
    });

    it("updates existing actionDefinition fields without changing others", () => {
      const templateUuid = uuidv4();
      const verbUuid = uuidv4();
      const nounUuid = uuidv4();
      const template = generateBlankActionTemplate({
        templateName: "Vitest Template",
        actionDefinition: { verbUuid, nounUuid: "", adjectiveUuid: "" },
      });
      getMissionDocHandle().change((m) => {
        m.actionTemplates[templateUuid] = template;
      });

      withMissionChange((m) =>
        applyUpdateActionTemplateActionDefinition(m, {
          actionTemplateUuid: templateUuid,
          type: "nounUuid",
          uuid: nounUuid,
        })
      );

      const def = getMissionDocHandle().doc().actionTemplates[templateUuid].actionDefinition;
      expect(def.verbUuid).toBe(verbUuid);
      expect(def.nounUuid).toBe(nounUuid);
    });

    it("does nothing when template uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateActionTemplateActionDefinition(m, {
            actionTemplateUuid: uuidv4(),
            type: "verbUuid",
            uuid: uuidv4(),
          })
        )
      ).not.toThrow();
    });
  });

  describe("applyCreateTemplateFromAction()", () => {
    it("creates a new action template from an existing action", () => {
      const action = generateBlankAction({
        name: "Source Action",
        description: "Action description",
      });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
      });

      const newTemplateUuid = withMissionChange((m) =>
        applyCreateTemplateFromAction(m, { actionUuid: action.uuid })
      );

      const doc = getMissionDocHandle().doc();
      expect(newTemplateUuid).toBeTruthy();
      expect(doc.actionTemplates[newTemplateUuid]).toBeDefined();
    });

    it("names the new template using the action name", () => {
      const action = generateBlankAction({ name: "Vitest Source Action" });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
      });

      const newTemplateUuid = withMissionChange((m) =>
        applyCreateTemplateFromAction(m, { actionUuid: action.uuid })
      );

      const template = getMissionDocHandle().doc().actionTemplates[newTemplateUuid];
      expect(template.templateName).toContain("Vitest Source Action");
    });

    it("copies action fields into the new template", () => {
      const action = generateBlankAction({
        name: "Vitest My Action",
        description: "My desc",
        duration: 42,
      });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
      });

      const newTemplateUuid = withMissionChange((m) =>
        applyCreateTemplateFromAction(m, { actionUuid: action.uuid })
      );

      const template = getMissionDocHandle().doc().actionTemplates[newTemplateUuid];
      expect(template.name).toBe("Vitest My Action");
      expect(template.description).toBe("My desc");
      expect(template.duration).toBe(42);
    });

    it("returns an empty string when the action does not exist", () => {
      const result = withMissionChange((m) =>
        applyCreateTemplateFromAction(m, { actionUuid: uuidv4() })
      );
      expect(result).toBe("");
    });

    it("uses Verb/Noun/Adj fallback names when stmAction is true and actionDefinitions are missing", () => {
      // stmAction=true but no actionDefinitions set, so names are undefined
      const action = generateBlankAction({
        name: "Vitest STM Action",
        stmAction: true,
        actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
      });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
        // actionDefinitions not set — will be null, so lookups return undefined
      });

      const newTemplateUuid = withMissionChange((m) =>
        applyCreateTemplateFromAction(m, { actionUuid: action.uuid })
      );

      const template = getMissionDocHandle().doc().actionTemplates[newTemplateUuid];
      // Falls back to "Verb", "Noun", "Adj" since no actionDefinitions exist
      expect(template.templateName).toContain("Verb");
      expect(template.templateName).toContain("Noun");
      expect(template.templateName).toContain("Adj");
    });

    it("uses actual verb/noun/adj names when stmAction is true and actionDefinitions are present", () => {
      const verbUuid = uuidv4();
      const nounUuid = uuidv4();
      const adjUuid = uuidv4();
      const action = generateBlankAction({
        name: "Vitest STM Action",
        stmAction: true,
        actionDefinition: { verbUuid, nounUuid, adjectiveUuid: adjUuid },
      });
      getMissionDocHandle().change((m) => {
        m.actions[action.uuid] = action;
        m.actionDefinitions = {
          verbs: { [verbUuid]: { name: "Observe", abbr: "obs" } },
          nouns: { [nounUuid]: { name: "Boulder", abbr: "bld" } },
          adjectives: { [adjUuid]: { name: "Proximal", abbr: "prox" } },
        };
      });

      const newTemplateUuid = withMissionChange((m) =>
        applyCreateTemplateFromAction(m, { actionUuid: action.uuid })
      );

      const template = getMissionDocHandle().doc().actionTemplates[newTemplateUuid];
      expect(template.templateName).toContain("Observe");
      expect(template.templateName).toContain("Boulder");
      expect(template.templateName).toContain("Proximal");
    });
  });
});
