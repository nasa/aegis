import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankRex } from "store/storeUtils/rex";
import { generateBlankEVA } from "store/storeUtils/eva";
import {
  captureAssetPlacement,
  compareByName,
  getAssetDraftValues,
  getAssetHiddenReason,
  getAssetPlacementPetSeconds,
  getChangedAssetFields,
  getMostRecentAsset,
  getVisibleMapAssets,
  isAssetVisibleOnMap,
  mergeAssetDraftWithDocument,
  validateAssetDraftValues,
} from "utils/assets";
import { calculatePetValue, petSecondsAt } from "utils/formatting";

const placement = (overrides: Partial<AssetPlacementContext> = {}): AssetPlacementContext => ({
  locationSetAt: Date.parse("2026-10-30T12:00:00Z"),
  runningRexUuid: null,
  runningRexName: null,
  runningEvaUuid: null,
  runningEvaName: null,
  petClock: null,
  ...overrides,
});

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
    const clock: AssetPetClockSnapshot = {
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

describe("captureAssetPlacement", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");

  test("records only the time when no REX is running", () => {
    const rex = generateBlankRex({ evaUuid: "eva", isRunning: false });
    expect(captureAssetPlacement({ rexes: { [rex.uuid]: rex }, evas: {} }, now)).toEqual({
      placement: placement({ locationSetAt: now }),
      ambiguous: false,
    });
  });

  test("captures the running REX, its as-planned EVA name, and a detached clock copy", () => {
    const planned = generateBlankEVA({ name: "EVA 2" });
    const rexEva = generateBlankEVA({ name: "", refUuid: planned.refUuid });
    const selectedButStopped = generateBlankRex({ name: "Old", evaUuid: rexEva.uuid });
    const rex = generateBlankRex({
      name: "REX A",
      evaUuid: rexEva.uuid,
      isRunning: true,
      petRunning: true,
      petValueAtStartStop: "+00:10:00",
      petStartStopTimestamp: "2026-10-30T11:59:00Z",
    });
    const mission = {
      rexes: { [rex.uuid]: rex, [selectedButStopped.uuid]: selectedButStopped },
      evas: { [planned.uuid]: planned, [rexEva.uuid]: rexEva },
    };
    const { placement: captured, ambiguous } = captureAssetPlacement(mission, now);
    expect(ambiguous).toBe(false);
    expect(captured).toMatchObject({
      runningRexUuid: rex.uuid,
      runningRexName: "REX A",
      runningEvaUuid: rexEva.uuid,
      runningEvaName: "EVA 2",
    });
    rex.petValueAtStartStop = "+05:00:00";
    expect(captured.petClock.petValueAtStartStop).toBe("+00:10:00");
    expect(getAssetPlacementPetSeconds(captured)).toBe(600 + 60);
  });

  test("stores no REX context when more than one REX is running", () => {
    const a = generateBlankRex({ evaUuid: "eva", isRunning: true });
    const b = generateBlankRex({ evaUuid: "eva", isRunning: true });
    const result = captureAssetPlacement({ rexes: { [a.uuid]: a, [b.uuid]: b }, evas: {} }, now);
    expect(result.ambiguous).toBe(true);
    expect(result.placement).toEqual(placement({ locationSetAt: now }));
  });

  test("historical PET survives REX deletion and later clock changes", () => {
    const rex = generateBlankRex({
      evaUuid: "eva",
      isRunning: true,
      petRunning: false,
      petValueAtStartStop: "-00:00:30",
    });
    const mission = { rexes: { [rex.uuid]: rex }, evas: {} };
    const { placement: captured } = captureAssetPlacement(mission, now);
    delete mission.rexes[rex.uuid];
    expect(getAssetPlacementPetSeconds(captured)).toBe(-30);
  });
});

describe("ordering and defaults", () => {
  test("sorts by name case-insensitively with a uuid tie-breaker", () => {
    const items = [
      { name: "zebra", uuid: "1" },
      { name: "Alpha", uuid: "b" },
      { name: "alpha", uuid: "a" },
    ];
    expect([...items].sort(compareByName).map((i) => i.uuid)).toEqual(["a", "b", "1"]);
  });

  test("most recent asset uses createdAt then uuid", () => {
    const a = generateBlankAsset({ uuid: "a", createdAt: 5 });
    const b = generateBlankAsset({ uuid: "b", createdAt: 5 });
    const c = generateBlankAsset({ uuid: "c", createdAt: 1 });
    expect(getMostRecentAsset([a, c, b])?.uuid).toBe("b");
    expect(getMostRecentAsset([])).toBeNull();
  });
});

describe("map visibility", () => {
  const placed = (overrides: Partial<Asset> = {}) =>
    generateBlankAsset({
      name: "Drill",
      location: { lat: 0, lng: 0 },
      placement: placement(),
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
      draft: null,
      showAssets: true,
    });
    expect(result.map((a) => a.uuid)).toEqual([shown.uuid]);
    expect(result[0].icon).toBe("2754");
  });

  test("a draft replaces its saved asset and a new draft draws once placed", () => {
    const saved = placed();
    const editDraft: AssetDraft = {
      uuid: saved.uuid,
      isNew: false,
      missionId: 1,
      values: { ...getAssetDraftValues(saved), location: { lat: 1, lng: 2 }, name: "Moved" },
      base: getAssetDraftValues(saved),
      elevationPending: false,
      message: null,
    };
    const edited = getVisibleMapAssets({
      assets: [saved],
      folders: [],
      draft: editDraft,
      showAssets: true,
    });
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({
      uuid: saved.uuid,
      name: "Moved",
      location: { lat: 1, lng: 2 },
    });

    const newDraft: AssetDraft = { ...editDraft, uuid: "new", isNew: true, base: null };
    expect(
      getVisibleMapAssets({
        assets: [],
        folders: [],
        draft: { ...newDraft, values: { ...newDraft.values, location: null } },
        showAssets: true,
      })
    ).toEqual([]);
    expect(
      getVisibleMapAssets({ assets: [], folders: [], draft: newDraft, showAssets: true })
    ).toHaveLength(1);
  });
});

describe("draft change tracking", () => {
  const base = getAssetDraftValues(
    generateBlankAsset({
      name: "Drill",
      location: { lat: 1, lng: 1 },
      elevation: 5,
      placement: placement(),
    })
  );

  test("metadata edits leave location, elevation, and placement out of the change", () => {
    expect(getChangedAssetFields(base, { ...base, notes: "left by rover" })).toEqual({
      notes: "left by rover",
    });
  });

  test("a location change carries elevation and placement with it", () => {
    const moved = {
      ...base,
      location: { lat: 2, lng: 2 },
      placement: placement({ locationSetAt: 9 }),
    };
    expect(Object.keys(getChangedAssetFields(base, moved)).sort()).toEqual([
      "elevation",
      "location",
      "placement",
    ]);
  });

  test("merging adopts others' changes and reports only true conflicts", () => {
    const mine = { ...base, name: "Mine", notes: "n" };
    const theirsName = { ...base, name: "Theirs" };
    const theirsColor = { ...base, color: "#ff0000" };
    expect(mergeAssetDraftWithDocument(base, mine, theirsColor)).toEqual({
      values: { ...mine, color: "#ff0000" },
      conflicts: [],
    });
    expect(mergeAssetDraftWithDocument(base, mine, theirsName).conflicts).toEqual(["name"]);
  });

  test("validation requires a trimmed name and finite nonnegative uncertainty", () => {
    expect(validateAssetDraftValues({ ...base, name: "  " })).toMatch(/Name/);
    expect(validateAssetDraftValues({ ...base, uncertaintyMeters: -1 })).toMatch(/Radius/);
    expect(validateAssetDraftValues({ ...base, uncertaintyMeters: NaN })).toMatch(/Radius/);
    expect(validateAssetDraftValues({ ...base, location: { lat: NaN, lng: 0 } })).toMatch(/finite/);
    expect(validateAssetDraftValues(base)).toBeNull();
    expect(
      validateAssetDraftValues({ ...base, location: null, placement: null, elevation: null })
    ).toBeNull();
  });
});
