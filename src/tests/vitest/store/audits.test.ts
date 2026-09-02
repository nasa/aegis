import cloneDeep from "lodash/cloneDeep";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/preset");
vi.mock("http-client/terrainProfile");
import * as httpClient_preset from "http-client/preset";
import * as httpClient_terrainProfile from "http-client/terrainProfile";

import { initialState as wholeStoreInitialState } from "store/index";
import { auditPresetsAgainstLayers, auditTraverseTerrainProfiles } from "store/processing/audits";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(httpClient_preset.upsertPresets).mockResolvedValue({
    status: "success",
  } as Awaited<ReturnType<typeof httpClient_preset.upsertPresets>>);
});

afterAll(() => {
  vi.restoreAllMocks();
});

/**
 * Build a minimal WholeStoreState with one layer, one sublayer, and a preset
 * whose sublayer control is visible but has the given style.
 */
const buildState = (controlStyle: MapSublayerStyle | null): WholeStoreState => {
  const layer = generateBlankLayer({ name: "Vitest Layer" });
  const sublayer = generateBlankSublayer({ name: "Vitest Sublayer", layerUuid: layer.uuid });
  const preset = generateBlankPreset({
    name: "Vitest Preset",
    missionDefault: true,
    layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sublayer.uuid] }],
    mapSublayerControls: {
      [sublayer.uuid]: {
        name: sublayer.name,
        sublayerUuid: sublayer.uuid,
        visible: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style: controlStyle as any,
      },
    },
  });

  const state = cloneDeep(wholeStoreInitialState) as WholeStoreState;
  state.mission.layers = [layer];
  state.mission.sublayers = [sublayer];
  state.preset.presets = [preset];
  state.preset.presetsFromDb = [cloneDeep(preset)];
  return state;
};

describe("auditPresetsAgainstLayers", () => {
  it("backfills a default style onto a visible control that has none", async () => {
    const state = buildState(null);
    const sublayerUuid = state.mission.sublayers[0].uuid;

    await auditPresetsAgainstLayers({ wholeStoreState: state });

    // The partially-migrated control now carries the full default style.
    expect(state.preset.presets[0].mapSublayerControls[sublayerUuid].style).toEqual(
      defaultSublayerStyle
    );
    // The repaired preset was persisted to the DB.
    expect(httpClient_preset.upsertPresets).toHaveBeenCalledTimes(1);
  });

  it("leaves an existing style untouched and does not persist", async () => {
    const customStyle: MapSublayerStyle = {
      ...defaultSublayerStyle,
      brightness: 1.5,
      opacity: 0.5,
    };
    const state = buildState(customStyle);
    const sublayerUuid = state.mission.sublayers[0].uuid;

    await auditPresetsAgainstLayers({ wholeStoreState: state });

    expect(state.preset.presets[0].mapSublayerControls[sublayerUuid].style).toEqual(customStyle);
    expect(httpClient_preset.upsertPresets).not.toHaveBeenCalled();
  });

  it("backfills missing style fields without overwriting custom values", async () => {
    const legacyStyle = {
      ...defaultSublayerStyle,
      labelColor: undefined,
      labelHaloColor: undefined,
      labelHaloWidth: undefined,
      labelHaloOpacity: undefined,
      opacity: 0.5,
    } as unknown as MapSublayerStyle;
    const state = buildState(legacyStyle);
    const sublayerUuid = state.mission.sublayers[0].uuid;

    await auditPresetsAgainstLayers({ wholeStoreState: state });

    expect(state.preset.presets[0].mapSublayerControls[sublayerUuid].style).toEqual({
      ...defaultSublayerStyle,
      opacity: 0.5,
    });
    expect(httpClient_preset.upsertPresets).toHaveBeenCalledTimes(1);
  });
});

describe("auditTraverseTerrainProfiles", () => {
  beforeEach(() => {
    setMissionAutomergeDocHandle(null);
    getMissionDocHandle().change((mission) => {
      mission.id = 42;
      mission.demFilePath = "dem/test.tif";
      mission.traverses = {};
    });
  });

  it("adds a null slope field to a legacy traverse without a usable path", async () => {
    const traverse = generateBlankTraverse({ path: [], pathSegmentDistances: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (traverse as any).pathSegmentAbsoluteSlopes;
    getMissionDocHandle().change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });

    await auditTraverseTerrainProfiles({ missionDocHandle: getMissionDocHandle() });

    expect(httpClient_terrainProfile.getTerrainProfile).not.toHaveBeenCalled();
    expect(getMissionDocHandle().doc().traverses[traverse.uuid]).toHaveProperty(
      "pathSegmentAbsoluteSlopes",
      null
    );
  });

  it("backfills aligned elevation and absolute-slope data", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: [[1, 2]],
      pathSegmentAbsoluteSlopes: null,
    });
    getMissionDocHandle().change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });
    vi.mocked(httpClient_terrainProfile.getTerrainProfile).mockResolvedValue({
      status: "success",
      message: "",
      data: {
        elevationsMeters: [[10, 11]],
        terrainSlopesDegrees: [[null, 2.5]],
      },
    });

    await auditTraverseTerrainProfiles({ missionDocHandle: getMissionDocHandle() });

    const updatedTraverse = getMissionDocHandle().doc().traverses[traverse.uuid];
    expect(updatedTraverse.pathSegmentElevations).toEqual([[10, 11]]);
    expect(updatedTraverse.pathSegmentAbsoluteSlopes).toEqual([[null, 2.5]]);
    expect(httpClient_terrainProfile.getTerrainProfile).toHaveBeenCalledWith({
      missionId: 42,
      path: traverse.path,
      pathSegmentDistances: traverse.pathSegmentDistances,
      entityKey: traverse.uuid,
    });
  });

  it("does not fetch or overwrite an existing absolute-slope profile", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: [[10, 11]],
      pathSegmentAbsoluteSlopes: [[1, 2]],
    });
    getMissionDocHandle().change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });

    await auditTraverseTerrainProfiles({ missionDocHandle: getMissionDocHandle() });

    expect(httpClient_terrainProfile.getTerrainProfile).not.toHaveBeenCalled();
    expect(getMissionDocHandle().doc().traverses[traverse.uuid]).toEqual(traverse);
  });

  it("ignores an invalid terrain profile", async () => {
    const traverse = generateBlankTraverse({
      path: [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      pathSegmentDistances: [25],
      pathSegmentElevations: null,
      pathSegmentAbsoluteSlopes: null,
    });
    getMissionDocHandle().change((mission) => {
      mission.traverses[traverse.uuid] = traverse;
    });
    vi.mocked(httpClient_terrainProfile.getTerrainProfile).mockResolvedValue({
      status: "success",
      message: "",
      data: {
        elevationsMeters: [[10, 11]],
        terrainSlopesDegrees: [],
      },
    });

    await auditTraverseTerrainProfiles({ missionDocHandle: getMissionDocHandle() });

    const unchangedTraverse = getMissionDocHandle().doc().traverses[traverse.uuid];
    expect(unchangedTraverse.pathSegmentElevations).toBeNull();
    expect(unchangedTraverse.pathSegmentAbsoluteSlopes).toBeNull();
  });
});
