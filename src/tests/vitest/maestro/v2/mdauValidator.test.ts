import { describe, it, expect } from "vitest";
import { mdauDataValidator } from "server/maestro/v2/mdauValidator";
import { generateBlankAction } from "store/storeUtils/action";
import type { MDAU } from "server/maestro/v2/types/mdau";

// ── Helpers ──────────────────────────────────────────────────────────────────

const actionDefinitions: ActionDefinitions = {
  verbs: { "verb-1": { name: "Collect", abbr: "COL" } },
  nouns: { "noun-1": { name: "Regolith", abbr: "REG" } },
  adjectives: { "adj-1": { name: "Shadowed", abbr: "SHD" } },
};

const buildMission = (overrides: Partial<Mission> = {}): Mission =>
  ({ actionDefinitions, actions: {}, ...overrides }) as unknown as Mission;

/** A full MdauAction carrying the given actionDefinition. */
const mdauWithActionDefinition = (
  refUuid: string,
  actionDefinition: ActionDefinition | null
): MDAU.MaestroDataAegisUses => ({
  aegisAction: {
    [refUuid]: {
      refUuid,
      name: "Vitest Action",
      descriptionTask: null,
      duration: null,
      actionDefinition,
      stmAction: false,
      actors: ["EV1"],
      updatedAt: 1_700_000_000_000,
    },
  },
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("mdauDataValidator() — actionDefinition uuids", () => {
  const action = generateBlankAction({});

  it("returns no errors for an empty payload", () => {
    expect(mdauDataValidator(buildMission(), {})).toEqual([]);
  });

  it("returns no errors when every uuid exists on the mission", () => {
    const mdau = mdauWithActionDefinition(action.refUuid, {
      verbUuid: "verb-1",
      nounUuid: "noun-1",
      adjectiveUuid: "adj-1",
    });
    expect(mdauDataValidator(buildMission(), mdau)).toEqual([]);
  });

  it("returns no errors for a partially-populated actionDefinition", () => {
    const mdau = mdauWithActionDefinition(action.refUuid, { verbUuid: "verb-1" });
    expect(mdauDataValidator(buildMission(), mdau)).toEqual([]);
  });

  it("returns no errors when the actionDefinition is null", () => {
    const mdau = mdauWithActionDefinition(action.refUuid, null);
    expect(mdauDataValidator(buildMission(), mdau)).toEqual([]);
  });

  it("reports an unknown noun uuid", () => {
    const mdau = mdauWithActionDefinition(action.refUuid, {
      verbUuid: "verb-1",
      nounUuid: "not-a-noun",
    });

    const errors = mdauDataValidator(buildMission(), mdau);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe(`aegisAction.${action.refUuid}.actionDefinition.nounUuid`);
    expect(errors[0].message).toContain("actionDefinitionExists");
    expect(errors[0].message).toContain("not-a-noun");
  });

  it("reports every unknown uuid on the same action", () => {
    const mdau = mdauWithActionDefinition(action.refUuid, {
      verbUuid: "nope-verb",
      nounUuid: "nope-noun",
      adjectiveUuid: "nope-adj",
    });

    expect(mdauDataValidator(buildMission(), mdau).map((e) => e.path)).toEqual([
      `aegisAction.${action.refUuid}.actionDefinition.verbUuid`,
      `aegisAction.${action.refUuid}.actionDefinition.nounUuid`,
      `aegisAction.${action.refUuid}.actionDefinition.adjectiveUuid`,
    ]);
  });

  it("reports an error when the mission has no actionDefinitions at all", () => {
    const mdau = mdauWithActionDefinition(action.refUuid, { verbUuid: "verb-1" });
    const errors = mdauDataValidator(buildMission({ actionDefinitions: null }), mdau);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("actionDefinitionExists");
  });
});
