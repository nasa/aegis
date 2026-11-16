import { generateBlankPosEntry, generateBlankRex } from "store/storeUtils/rex";
import {
  applyPosEntryDraft,
  getChangedPosEntryFields,
  getLatestPosEntryUuids,
  getPosEntryEditValues,
  getPosEntryRadiusColor,
  orderPosEntriesNewestFirst,
  validatePosEntryEditValues,
} from "utils/posEntries";

const entry = (uuid: string, petSeconds: number, posTypeUuids: string[], createdAt = 1) =>
  generateBlankPosEntry({
    uuid,
    petSeconds,
    posTypeUuids,
    createdAt,
    location: { lat: 1, lng: 2 },
  });

describe("posEntries utils", () => {
  it("orders newest-first by PET, then creation time, then uuid", () => {
    const ordered = orderPosEntriesNewestFirst([
      entry("a", 10, []),
      entry("b", 30, []),
      entry("c", 10, [], 5),
      entry("d", 10, [], 5),
    ]);
    expect(ordered.map((e) => e.uuid)).toEqual(["b", "d", "c", "a"]);
  });

  it("finds each pos type's newest entry by PET, not by creation order", () => {
    const latest = getLatestPosEntryUuids([
      entry("backfilled", 5, ["ev1"], 99),
      entry("ev1-latest", 50, ["ev1"], 1),
      entry("both", 20, ["ev1", "ev2"], 2),
    ]);
    expect([...latest].sort()).toEqual(["both", "ev1-latest"]);
  });

  it("draws no radius circle at zero radius and a dark yellow one without a custom color", () => {
    expect(getPosEntryRadiusColor({ uncertaintyMeters: 0, color: "#ff0000" })).toBeNull();
    expect(getPosEntryRadiusColor({ uncertaintyMeters: 5, color: null })).toBe("#C49A00");
    expect(getPosEntryRadiusColor({ uncertaintyMeters: 5, color: "#ff0000" })).toBe("#ff0000");
  });

  it("carries location and elevation together as one change", () => {
    const base = getPosEntryEditValues(
      generateBlankPosEntry({ location: { lat: 1, lng: 1 }, elevation: 3 })
    );
    expect(getChangedPosEntryFields(base, { ...base, uncertaintyMeters: 4 })).toEqual({
      uncertaintyMeters: 4,
    });
    expect(getChangedPosEntryFields(base, { ...base, location: { lat: 2, lng: 2 } })).toEqual({
      location: { lat: 2, lng: 2 },
      elevation: 3,
    });
  });

  it("requires a known type and source, a valid radius, a PET, and a location", () => {
    const rex = generateBlankRex({ evaUuid: "eva" });
    const valid: PosEntryEditValues = {
      location: { lat: 1, lng: 1 },
      elevation: null,
      petSeconds: 0,
      posTypeUuids: [rex.posTypes[0].uuid],
      posSourceUuid: rex.posSources[0].uuid,
      uncertaintyMeters: 0,
      color: null,
    };
    expect(validatePosEntryEditValues(valid, rex)).toBeNull();
    expect(validatePosEntryEditValues({ ...valid, posTypeUuids: ["gone"] }, rex)).toMatch(/type/);
    expect(validatePosEntryEditValues({ ...valid, posSourceUuid: null }, rex)).toMatch(/source/);
    expect(validatePosEntryEditValues({ ...valid, uncertaintyMeters: -1 }, rex)).toMatch(/Radius/);
    expect(validatePosEntryEditValues({ ...valid, petSeconds: null }, rex)).toMatch(/PET/);
    expect(validatePosEntryEditValues({ ...valid, location: null }, rex)).toMatch(/Place/);
  });

  describe("applyPosEntryDraft", () => {
    const saved = entry("saved", 10, ["ev1"]);
    const draft = (overrides: Partial<PosEntryInEdit>): PosEntryInEdit => ({
      uuid: "saved",
      rexUuid: "rex",
      isNew: false,
      values: { ...getPosEntryEditValues(saved), uncertaintyMeters: 9 },
      base: getPosEntryEditValues(saved),
      elevationPending: false,
      ...overrides,
    });

    it("replaces the saved entry with the draft under the same uuid", () => {
      const [drawn] = applyPosEntryDraft([saved], draft({}), "rex");
      expect(drawn).toMatchObject({
        uuid: "saved",
        uncertaintyMeters: 9,
        createdAt: saved.createdAt,
      });
    });

    it("shows a remote move while previewing local notes", () => {
      const session = draft({
        values: { ...getPosEntryEditValues(saved), notes: "Local notes" },
      });
      const remote = { ...saved, location: { lat: 5, lng: 6 }, elevation: 12, petSeconds: 30 };
      const [drawn] = applyPosEntryDraft([remote], session, "rex");
      expect(drawn).toMatchObject({
        location: remote.location,
        elevation: 12,
        petSeconds: 30,
        notes: "Local notes",
      });
      expect(getChangedPosEntryFields(session.base, session.values)).toEqual({
        notes: "Local notes",
      });
    });

    it("keeps a local move and its elevation while showing remote metadata", () => {
      const session = draft({
        values: { ...getPosEntryEditValues(saved), location: { lat: 3, lng: 4 }, elevation: null },
        elevationPending: true,
      });
      const remote = { ...saved, elevation: 15, color: "#00ff00", uncertaintyMeters: 25 };
      const [drawn] = applyPosEntryDraft([remote], session, "rex");
      expect(drawn).toMatchObject({
        location: { lat: 3, lng: 4 },
        elevation: null,
        color: "#00ff00",
        uncertaintyMeters: 25,
      });
    });

    it("uses the current saved PET and source while those draft fields are blank", () => {
      const session = draft({
        values: { ...getPosEntryEditValues(saved), petSeconds: null, posSourceUuid: null },
      });
      const remote = { ...saved, petSeconds: 45, posSourceUuid: "remote-source" };
      expect(applyPosEntryDraft([remote], session, "rex")[0]).toMatchObject({
        petSeconds: 45,
        posSourceUuid: "remote-source",
      });
    });

    it("appends a new draft and ignores a draft for another REX", () => {
      expect(applyPosEntryDraft([saved], draft({ uuid: "new", isNew: true }), "rex")).toHaveLength(
        2
      );
      expect(applyPosEntryDraft([saved], draft({ rexUuid: "other" }), "rex")).toEqual([saved]);
    });
  });
});
