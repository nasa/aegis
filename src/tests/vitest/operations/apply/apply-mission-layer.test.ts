import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyDeleteLayers,
  applyDeleteSublayers,
  applyUpsertLayers,
  applyUpsertSublayers,
  normalizeSublayerInput,
} from "operations/apply/apply-mission-layer";
import { generateBlankLayer } from "store/storeUtils/layer";
import { defaultSublayerStyle, generateBlankSublayer } from "store/storeUtils/sublayer";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankFolder } from "store/storeUtils/folder";

const getMission = (): Mission => getMissionDocHandle().doc();
const getPreset = (): Preset => Object.values(getMission().presets)[0];

let layer: Layer;

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  layer = generateBlankLayer({ name: "Vitest Layer" });
  const preset = generateBlankPreset({ name: "Vitest Preset" });
  getMissionDocHandle().change((m) => {
    m.id = 7;
    m.layers = {};
    m.sublayers = {};
    m.folders = {};
    m.presets = { [preset.uuid]: preset };
  });
  withMissionChange((m) => applyUpsertLayers(m, [layer]));
});

describe("apply-mission-layer", () => {
  it("applyUpsertLayers() adds a layer order entry to every preset only once", () => {
    expect(getPreset().layerOrder).toEqual([{ layerUuid: layer.uuid, sublayerUuids: [] }]);
    withMissionChange((m) => applyUpsertLayers(m, [{ ...layer, name: "Renamed" }]));
    expect(getPreset().layerOrder).toHaveLength(1);
    expect(getMission().layers[layer.uuid].name).toBe("Renamed");
  });

  it("applyUpsertSublayers() adds a hidden control and keeps the control name in sync", () => {
    const sublayer = generateBlankSublayer({ name: "Vitest Sublayer", layerUuid: layer.uuid });
    withMissionChange((m) => applyUpsertSublayers(m, [sublayer]));

    expect(getPreset().mapSublayerControls[sublayer.uuid]).toEqual({
      name: "Vitest Sublayer",
      sublayerUuid: sublayer.uuid,
      visible: false,
      style: defaultSublayerStyle,
    });
    expect(getPreset().layerOrder[0].sublayerUuids).toEqual([sublayer.uuid]);

    withMissionChange((m) => applyUpsertSublayers(m, [{ ...sublayer, name: "Renamed" }]));
    expect(getPreset().mapSublayerControls[sublayer.uuid].name).toBe("Renamed");
    expect(getPreset().layerOrder[0].sublayerUuids).toEqual([sublayer.uuid]);
  });

  it("applyUpsertSublayers() moves a sublayer between layer order entries", () => {
    const layer2 = generateBlankLayer({ name: "Vitest Layer 2" });
    const sublayer = generateBlankSublayer({ layerUuid: layer.uuid });
    withMissionChange((m) => {
      applyUpsertLayers(m, [layer2]);
      applyUpsertSublayers(m, [sublayer]);
    });

    withMissionChange((m) => applyUpsertSublayers(m, [{ ...sublayer, layerUuid: layer2.uuid }]));
    expect(getPreset().layerOrder).toEqual([
      { layerUuid: layer.uuid, sublayerUuids: [] },
      { layerUuid: layer2.uuid, sublayerUuids: [sublayer.uuid] },
    ]);
  });

  it("applyDeleteSublayers() removes the sublayer from every preset", () => {
    const sublayer = generateBlankSublayer({ layerUuid: layer.uuid });
    withMissionChange((m) => applyUpsertSublayers(m, [sublayer]));
    withMissionChange((m) => applyDeleteSublayers(m, [sublayer.uuid]));

    expect(getMission().sublayers[sublayer.uuid]).toBeUndefined();
    expect(getPreset().mapSublayerControls[sublayer.uuid]).toBeUndefined();
    expect(getPreset().layerOrder[0].sublayerUuids).toEqual([]);
  });

  it("applyDeleteLayers() deletes the layer, its sublayers, and its folder and preset entries", () => {
    const sublayer = generateBlankSublayer({ layerUuid: layer.uuid });
    const folder = generateBlankFolder({ type: "layer", items: [layer.uuid] });
    withMissionChange((m) => {
      applyUpsertSublayers(m, [sublayer]);
      m.folders[folder.uuid] = folder;
    });

    withMissionChange((m) => applyDeleteLayers(m, [layer.uuid]));
    const mission = getMission();
    expect(mission.layers[layer.uuid]).toBeUndefined();
    expect(mission.sublayers[sublayer.uuid]).toBeUndefined();
    expect(mission.folders[folder.uuid].items).toEqual([]);
    expect(getPreset().layerOrder).toEqual([]);
    expect(getPreset().mapSublayerControls).toEqual({});
  });

  it("normalizeSublayerInput() fills defaults and stamps numeric dates", () => {
    const sublayer = normalizeSublayerInput(getMission(), {
      uuid: "new-sublayer",
      layerUuid: layer.uuid,
      name: "From pipeline",
      // the GIS pipeline sends ISO string dates
      createdAt: "2026-01-01T00:00:00Z" as unknown as number,
    });

    expect(typeof sublayer.createdAt).toBe("number");
    expect(sublayer.timeLayerManifest).toEqual([]);
    expect(sublayer.isTimeBased).toBe(false);
    expect(sublayer.name).toBe("From pipeline");
  });
});
