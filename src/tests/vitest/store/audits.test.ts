import cloneDeep from "lodash/cloneDeep";

// mock all calls to the db so no transactions are actually made
// CAUTION, the import line must be below the vi.mock
vi.mock("http-client/preset");
import * as httpClient_preset from "http-client/preset";

import { initialState as wholeStoreInitialState } from "store/index";
import { auditPresetsAgainstLayers } from "store/processing/audits";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankLayer } from "store/storeUtils/layer";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

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
