import {
  buildActionOrdinalLabels,
  buildActionEditCapabilities,
  canEditInRexScope,
  findRexUuidForEntity,
  resolveRexExecuteEditMode,
} from "utils/rexExecuteEditMode";

/** Capabilities limited editing permits on entities that existed before execution. */
const LIMITED_ALLOWED_CAPABILITIES: EvaEditCapability[] = [
  "activityDuration",
  "traversePath",
  "evaSequenceAdd",
  "evaSequenceReorder",
  "actionCreate",
  "actionReorder",
  "actionCrewAssigned",
  "actionEnabled",
  "sampleCollectionIds",
  "executedSampleMass",
];

/** Capabilities limited editing withholds unless the entity was added under it. */
const LIMITED_FORBIDDEN_CAPABILITIES: EvaEditCapability[] = ["stationLocation"];

const ALL_CAPABILITIES: EvaEditCapability[] = [
  ...LIMITED_ALLOWED_CAPABILITIES,
  ...LIMITED_FORBIDDEN_CAPABILITIES,
];

const makeRex = (overrides: Partial<Rex> = {}): Rex =>
  ({
    uuid: "rex-1",
    evaUuid: "eva-rex",
    isRunning: true,
    executeEditMode: "limited",
    executeEditState: null,
    ...overrides,
  }) as Rex;

const makeMission = (rex: Rex): Mission =>
  ({
    rexes: { [rex.uuid]: rex },
    evas: {},
    stations: {},
    traverses: {},
    actions: {},
  }) as unknown as Mission;

describe("resolveRexExecuteEditMode()", () => {
  it("returns unrestricted for the as-planned scope", () => {
    expect(resolveRexExecuteEditMode(makeMission(makeRex()), null)).toBe("unrestricted");
  });

  it("returns unrestricted for an undefined mission", () => {
    expect(resolveRexExecuteEditMode(undefined, "rex-1")).toBe("unrestricted");
  });

  it("returns unrestricted for an unknown rex", () => {
    expect(resolveRexExecuteEditMode(makeMission(makeRex()), "nope")).toBe("unrestricted");
  });

  it.each(["limited", "none"] as RexExecuteEditMode[])(
    "returns unrestricted for a stopped rex stored as %s",
    (mode) => {
      const mission = makeMission(makeRex({ isRunning: false, executeEditMode: mode }));
      expect(resolveRexExecuteEditMode(mission, "rex-1")).toBe("unrestricted");
    }
  );

  it.each(["unrestricted", "limited", "none"] as RexExecuteEditMode[])(
    "returns the stored %s mode for a running rex",
    (mode) => {
      const mission = makeMission(makeRex({ executeEditMode: mode }));
      expect(resolveRexExecuteEditMode(mission, "rex-1")).toBe(mode);
    }
  );

  it("falls back to unrestricted when the field is missing", () => {
    const rex = makeRex();
    delete (rex as Partial<Rex>).executeEditMode;
    expect(resolveRexExecuteEditMode(makeMission(rex), "rex-1")).toBe("unrestricted");
  });
});

describe("canEditInRexScope()", () => {
  it.each(ALL_CAPABILITIES)("permits %s when unrestricted", (capability) => {
    expect(canEditInRexScope("unrestricted", capability)).toBe(true);
  });

  it.each(LIMITED_ALLOWED_CAPABILITIES)("permits %s when limited", (capability) => {
    expect(canEditInRexScope("limited", capability)).toBe(true);
  });

  it.each(LIMITED_FORBIDDEN_CAPABILITIES)("forbids %s when limited", (capability) => {
    expect(canEditInRexScope("limited", capability)).toBe(false);
  });

  it.each(LIMITED_FORBIDDEN_CAPABILITIES)(
    "permits %s when limited on an entity added under the restriction",
    (capability) => {
      expect(canEditInRexScope("limited", capability, { entityWasAdded: true })).toBe(true);
    }
  );

  it.each(ALL_CAPABILITIES)("forbids %s when none", (capability) => {
    expect(canEditInRexScope("none", capability)).toBe(false);
  });

  it.each(ALL_CAPABILITIES)(
    "forbids %s when none even for an entity added earlier",
    (capability) => {
      expect(canEditInRexScope("none", capability, { entityWasAdded: true })).toBe(false);
    }
  );

  it("permits an added entity in limited mode", () => {
    expect(canEditInRexScope("limited", "actionCreate", { entityWasAdded: true })).toBe(true);
  });
});

describe("buildRexEditCapabilities()", () => {
  it("permits everything when unrestricted", () => {
    const caps = buildActionEditCapabilities("unrestricted", { actionWasAdded: false });
    expect(Object.values(caps).every(Boolean)).toBe(true);
  });

  it("forbids general fields and destructive operations on a pre-existing action in limited", () => {
    const caps = buildActionEditCapabilities("limited", { actionWasAdded: false });
    expect(caps).toEqual({
      crewAssigned: true,
      enabled: true,
      sampleIds: true,
      executedMass: true,
      reorder: true,
      generalFields: false,
      destructive: false,
    });
  });

  it("permits everything on an action added under limited editing", () => {
    const caps = buildActionEditCapabilities("limited", { actionWasAdded: true });
    expect(Object.values(caps).every(Boolean)).toBe(true);
  });

  it("forbids everything when none, even for an added action", () => {
    const caps = buildActionEditCapabilities("none", { actionWasAdded: true });
    expect(Object.values(caps).some(Boolean)).toBe(false);
  });
});

describe("findRexUuidForEntity()", () => {
  const mission = {
    rexes: { "rex-1": makeRex() },
    evas: {
      "eva-planned": {
        uuid: "eva-planned",
        sequence: [{ type: "station", uuid: "station-planned" }],
      },
      "eva-rex": {
        uuid: "eva-rex",
        sequence: [
          { type: "station", uuid: "station-rex" },
          { type: "traverse", uuid: "traverse-rex" },
        ],
      },
    },
    stations: { "station-planned": {}, "station-rex": {} },
    traverses: { "traverse-rex": {} },
    actions: {
      "action-rex": { uuid: "action-rex", stationUuid: "station-rex" },
      "action-planned": { uuid: "action-planned", stationUuid: "station-planned" },
      "action-poi": { uuid: "action-poi", poiUuid: "poi-1" },
    },
  } as unknown as Mission;

  it("resolves an eva directly", () => {
    expect(findRexUuidForEntity(mission, { evaUuid: "eva-rex" })).toBe("rex-1");
  });

  it("resolves a station through its eva", () => {
    expect(findRexUuidForEntity(mission, { stationUuid: "station-rex" })).toBe("rex-1");
  });

  it("resolves a traverse through its eva", () => {
    expect(findRexUuidForEntity(mission, { traverseUuid: "traverse-rex" })).toBe("rex-1");
  });

  it("resolves an action through its parent station", () => {
    expect(findRexUuidForEntity(mission, { actionUuid: "action-rex" })).toBe("rex-1");
  });

  it("returns null for as-planned entities", () => {
    expect(findRexUuidForEntity(mission, { evaUuid: "eva-planned" })).toBeNull();
    expect(findRexUuidForEntity(mission, { stationUuid: "station-planned" })).toBeNull();
    expect(findRexUuidForEntity(mission, { actionUuid: "action-planned" })).toBeNull();
  });

  it("returns null for a poi-parented action", () => {
    expect(findRexUuidForEntity(mission, { actionUuid: "action-poi" })).toBeNull();
  });

  it("returns null for an undefined mission", () => {
    expect(findRexUuidForEntity(undefined, { evaUuid: "eva-rex" })).toBeNull();
  });
});

describe("buildActionOrdinalLabels()", () => {
  it("renders positional letters when not pinning", () => {
    expect(
      buildActionOrdinalLabels({
        actionOrderUuids: ["a", "b", "c"],
        usePinnedLetters: false,
        parentWasAddedUnderLimitedEdit: false,
        baselineActionOrder: undefined,
      })
    ).toEqual(["A", "B", "C"]);
  });

  it("gives an action appended to the baseline the next letter", () => {
    // The baseline ran A-J, so the appended eleventh action becomes K.
    const baselineActionOrder = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
    const labels = buildActionOrdinalLabels({
      actionOrderUuids: baselineActionOrder,
      usePinnedLetters: true,
      parentWasAddedUnderLimitedEdit: false,
      baselineActionOrder,
    });
    expect(labels[labels.length - 1]).toBe("K");
  });

  it("keeps a pinned letter with its action through a reorder", () => {
    const baselineActionOrder = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
    // K is dragged above B: the column is deliberately no longer alphabetical.
    const labels = buildActionOrdinalLabels({
      actionOrderUuids: ["a", "k", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      usePinnedLetters: true,
      parentWasAddedUnderLimitedEdit: false,
      baselineActionOrder,
    });
    expect(labels.slice(0, 4)).toEqual(["A", "K", "B", "C"]);
  });

  it("prefixes 0+ and recomputes positionally for a parent added under limited editing", () => {
    expect(
      buildActionOrdinalLabels({
        actionOrderUuids: ["x", "y", "z"],
        usePinnedLetters: true,
        parentWasAddedUnderLimitedEdit: true,
        baselineActionOrder: undefined,
      })
    ).toEqual(["0+A", "0+B", "0+C"]);

    // Deleting the middle action recomputes the remaining letters.
    expect(
      buildActionOrdinalLabels({
        actionOrderUuids: ["x", "z"],
        usePinnedLetters: true,
        parentWasAddedUnderLimitedEdit: true,
        baselineActionOrder: undefined,
      })
    ).toEqual(["0+A", "0+B"]);
  });

  it("appends unknown actions to the end of the letter sequence", () => {
    expect(
      buildActionOrdinalLabels({
        actionOrderUuids: ["a", "orphan", "b"],
        usePinnedLetters: true,
        parentWasAddedUnderLimitedEdit: false,
        baselineActionOrder: ["a", "b"],
      })
    ).toEqual(["A", "C", "B"]);
  });

  it("falls back to positional letters when the baseline is missing", () => {
    expect(
      buildActionOrdinalLabels({
        actionOrderUuids: ["a", "b"],
        usePinnedLetters: true,
        parentWasAddedUnderLimitedEdit: false,
        baselineActionOrder: undefined,
      })
    ).toEqual(["A", "B"]);
  });

  it("handles a null action order", () => {
    expect(
      buildActionOrdinalLabels({
        actionOrderUuids: null,
        usePinnedLetters: false,
        parentWasAddedUnderLimitedEdit: false,
        baselineActionOrder: undefined,
      })
    ).toEqual([]);
  });
});
