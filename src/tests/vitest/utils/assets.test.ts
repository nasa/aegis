import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankRex } from "store/storeUtils/rex";
import {
  getAssetEditValues,
  getAssetRadiusColor,
  getAssetHiddenReason,
  getCurrentAssetPet,
  parseAssetPetSeconds,
  getChangedAssetFields,
  getVisibleMapAssets,
  isAssetVisibleOnMap,
  validateAssetEditValues,
} from "utils/assets";
import { calculatePetValue, petSecondsAt } from "utils/formatting";

describe("petSecondsAt", () => {
  const at = Date.parse("2026-10-30T12:00:10Z");

  test("adds elapsed time to a running clock, rounding up", () => {
    const clock = {
      petValueAtStartStop: "+01:00:00",
      petStartStopTimestamp: "2026-10-30T12:00:00.500Z",
      petRunning: true,
    };
    expect(petSecondsAt(clock, at)).toBe(3600 + 10);
  });

  test("returns the stored value for a paused clock, without needing a timestamp", () => {
    const clock: Pick<Rex, "petValueAtStartStop" | "petStartStopTimestamp" | "petRunning"> = {
      petValueAtStartStop: "+00:05:00",
      petStartStopTimestamp: null,
      petRunning: false,
    };
    expect(petSecondsAt(clock, at)).toBe(300);
  });

  test("handles negative PET", () => {
    const clock = {
      petValueAtStartStop: "-00:01:00",
      petStartStopTimestamp: "2026-10-30T12:00:00Z",
      petRunning: true,
    };
    expect(petSecondsAt(clock, at)).toBe(-50);
  });

  test("is unavailable for an invalid value or running anchor, and never reads the clock", () => {
    expect(petSecondsAt(null, at)).toBeNull();
    expect(
      petSecondsAt(
        { petValueAtStartStop: "nonsense", petStartStopTimestamp: null, petRunning: false },
        at
      )
    ).toBeNull();
    expect(
      petSecondsAt(
        { petValueAtStartStop: "+00:00:01", petStartStopTimestamp: "not a date", petRunning: true },
        at
      )
    ).toBeNull();
  });

  test("calculatePetValue keeps its epoch-0 fallback for unparseable timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    expect(
      calculatePetValue({ petStartStopTimestamp: "bad", petValueAtStartStop: "+00:00:05" })
    ).toBe("+00:00:15");
    vi.useRealTimers();
  });
});

describe("getCurrentAssetPet", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");

  test("captures a running clock's PET at creation", () => {
    const rex = generateBlankRex({
      evaUuid: "eva",
      isRunning: true,
      petRunning: true,
      petValueAtStartStop: "+00:10:00",
      petStartStopTimestamp: "2026-10-30T11:59:00Z",
    });
    expect(getCurrentAssetPet({ rexes: { [rex.uuid]: rex } }, now)).toEqual({
      petSeconds: 660,
      petRex: { uuid: rex.uuid, name: rex.name },
    });
  });

  test("captures a paused negative PET without retaining a clock reference", () => {
    const rex = generateBlankRex({
      evaUuid: "eva",
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "-00:00:30",
      name: "REX A",
    });
    const mission = { rexes: { [rex.uuid]: rex } };
    const captured = getCurrentAssetPet(mission, now);
    rex.petValueAtStartStop = "+05:00:00";
    rex.name = "Renamed";
    delete mission.rexes[rex.uuid];
    expect(captured).toEqual({ petSeconds: -30, petRex: { uuid: rex.uuid, name: "REX A" } });
  });

  test("leaves PET blank with zero or multiple running REXes", () => {
    const a = generateBlankRex({ evaUuid: "eva", isRunning: true });
    const b = generateBlankRex({ evaUuid: "eva", isRunning: true });
    expect(getCurrentAssetPet({ rexes: {} }, now)).toEqual({ petSeconds: null, petRex: null });
    expect(getCurrentAssetPet({ rexes: { [a.uuid]: a, [b.uuid]: b } }, now)).toEqual({
      petSeconds: null,
      petRex: null,
    });
  });
});

describe("parseAssetPetSeconds", () => {
  test.each([
    ["+00:00:00", 0],
    ["12:34:56", 45296],
    [" -01:02:03 ", -3723],
    ["+100:00:00", 360000],
    ["", null],
    ["+01:60:00", null],
    ["+01:00:60", null],
    ["1:00", null],
    ["nonsense", null],
  ])("parses %s as %s", (text, expected) => {
    expect(parseAssetPetSeconds(text)).toBe(expected);
  });
});

describe("defaults", () => {
  test("radius color is the asset color, or transparent, only for a positive radius", () => {
    expect(getAssetRadiusColor({ color: "#ff0000", uncertaintyMeters: 5 })).toBe("#ff0000");
    expect(getAssetRadiusColor({ color: null, uncertaintyMeters: 5 })).toBe("transparent");
    expect(getAssetRadiusColor({ color: "#ff0000", uncertaintyMeters: 0 })).toBeNull();
  });
});

describe("map visibility", () => {
  const placed = (overrides: Partial<Asset> = {}) =>
    generateBlankAsset({
      name: "Drill",
      location: { lat: 0, lng: 0 },
      locationSetAt: Date.parse("2026-10-30T12:00:00Z"),
      ...overrides,
    });

  test("applies the shared item and folder flags and the viewer's toggle", () => {
    const asset = placed();
    expect(isAssetVisibleOnMap(asset, null, true)).toBe(true);
    expect(isAssetVisibleOnMap(asset, null, false)).toBe(false);
    expect(isAssetVisibleOnMap({ ...asset, visible: false }, null, true)).toBe(false);
    expect(isAssetVisibleOnMap(asset, { visible: false }, true)).toBe(false);
    // A zero coordinate is placed; a null location is not.
    expect(isAssetVisibleOnMap({ ...asset, location: null }, null, true)).toBe(false);
  });

  test("an item's own hidden flag wins over its folder", () => {
    expect(getAssetHiddenReason({ visible: false }, { visible: false })).toBe("asset");
    expect(getAssetHiddenReason({ visible: true }, { visible: false })).toBe("folder");
    expect(getAssetHiddenReason({ visible: true }, { visible: true })).toBeNull();
  });

  test("filters unplaced and hidden assets and draws null icons as ❔", () => {
    const shown = placed({ icon: null });
    const unplaced = generateBlankAsset({ name: "Box" });
    const inHiddenFolder = placed();
    const folder = generateBlankFolder({
      type: "asset",
      visible: false,
      items: [inHiddenFolder.uuid],
    });
    const result = getVisibleMapAssets({
      assets: [shown, unplaced, inHiddenFolder],
      folders: [folder],
      inEdit: null,
      showAssets: true,
    });
    expect(result.map((a) => a.uuid)).toEqual([shown.uuid]);
    expect(result[0].icon).toBe("2754");
  });

  test("the in-edit asset replaces its saved asset and a new asset draws once placed", () => {
    const saved = placed();
    const editSession: AssetInEdit = {
      uuid: saved.uuid,
      isNew: false,
      values: { ...getAssetEditValues(saved), location: { lat: 1, lng: 2 }, name: "Moved" },
      base: getAssetEditValues(saved),
      elevationPending: false,
    };
    const edited = getVisibleMapAssets({
      assets: [saved],
      folders: [],
      inEdit: editSession,
      showAssets: true,
    });
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({
      uuid: saved.uuid,
      name: "Moved",
      location: { lat: 1, lng: 2 },
    });

    const newSession: AssetInEdit = { ...editSession, uuid: "new", isNew: true, base: null };
    expect(
      getVisibleMapAssets({
        assets: [],
        folders: [],
        inEdit: { ...newSession, values: { ...newSession.values, location: null } },
        showAssets: true,
      })
    ).toEqual([]);
    expect(
      getVisibleMapAssets({ assets: [], folders: [], inEdit: newSession, showAssets: true })
    ).toHaveLength(1);
  });
});

describe("in-edit change tracking", () => {
  const base = getAssetEditValues(
    generateBlankAsset({
      name: "Drill",
      location: { lat: 1, lng: 1 },
      elevation: 5,
      locationSetAt: Date.parse("2026-10-30T12:00:00Z"),
    })
  );

  test("metadata edits leave location, elevation, and its timestamp out of the change", () => {
    expect(getChangedAssetFields(base, { ...base, notes: "left by rover" })).toEqual({
      notes: "left by rover",
    });
  });

  test("PET edits leave location, elevation, and its timestamp out of the change", () => {
    expect(getChangedAssetFields(base, { ...base, petSeconds: -30 })).toEqual({
      petSeconds: -30,
      petRex: null,
    });
  });

  test("a location change carries elevation and its timestamp with it", () => {
    const moved = {
      ...base,
      location: { lat: 2, lng: 2 },
      locationSetAt: 9,
    };
    expect(Object.keys(getChangedAssetFields(base, moved)).sort()).toEqual([
      "elevation",
      "location",
      "locationSetAt",
    ]);
  });

  test("validation requires a trimmed name and finite nonnegative uncertainty", () => {
    expect(validateAssetEditValues({ ...base, name: "  " })).toMatch(/Name/);
    expect(validateAssetEditValues({ ...base, uncertaintyMeters: -1 })).toMatch(/Radius/);
    expect(validateAssetEditValues({ ...base, uncertaintyMeters: NaN })).toMatch(/Radius/);
    expect(validateAssetEditValues({ ...base, petSeconds: NaN })).toMatch(/PET/);
    expect(validateAssetEditValues({ ...base, petSeconds: 0.5 })).toMatch(/PET/);
    expect(validateAssetEditValues({ ...base, location: { lat: NaN, lng: 0 } })).toMatch(/finite/);
    expect(validateAssetEditValues(base)).toBeNull();
    expect(
      validateAssetEditValues({ ...base, location: null, locationSetAt: null, elevation: null })
    ).toBeNull();
  });
});
