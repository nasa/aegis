import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";
import { generateBlankLayer } from "store/storeUtils/layer";
import { defaultSublayerStyle, generateBlankSublayer } from "store/storeUtils/sublayer";

import { applyRemoveItemsFromAllFolders } from "./apply-mission-folder";

/**
 * Build a doc-ready layer from untrusted input (REST body). Keeps the stored createdAt of an
 * existing layer and stamps updatedAt.
 */
export function normalizeLayerInput(m: Mission, input: Partial<Layer>): Layer {
  const now = getAccurateNow().getTime();
  const existing = input.uuid ? m.layers[input.uuid] : undefined;
  const blank = generateBlankLayer();
  return {
    ...(Number.isFinite(input.order ?? existing?.order)
      ? { order: input.order ?? existing.order }
      : {}),
    uuid: input.uuid ?? blank.uuid,
    name: input.name ?? existing?.name ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Build a doc-ready sublayer from untrusted input (REST body). See `normalizeLayerInput`. */
export function normalizeSublayerInput(m: Mission, input: Partial<Sublayer>): Sublayer {
  const now = getAccurateNow().getTime();
  const existing = input.uuid ? m.sublayers[input.uuid] : undefined;
  const base = existing ?? generateBlankSublayer();
  const pick = <K extends keyof Sublayer>(key: K): Sublayer[K] =>
    input[key] === undefined ? base[key] : (input[key] as Sublayer[K]);
  return {
    uuid: input.uuid ?? base.uuid,
    layerUuid: pick("layerUuid"),
    type: pick("type"),
    name: pick("name") ?? "",
    description: pick("description") ?? "",
    legend: pick("legend"),
    path: pick("path") ?? "",
    tilePattern: pick("tilePattern"),
    boundingBox: pick("boundingBox"),
    tileFormat: pick("tileFormat"),
    minNativeZoom: pick("minNativeZoom"),
    maxNativeZoom: pick("maxNativeZoom"),
    maxZoom: pick("maxZoom"),
    isTimeBased: pick("isTimeBased") ?? false,
    timeLayerManifest: pick("timeLayerManifest") ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Get (or create) a preset's layerOrder entry for a layer. */
const getPresetLayerOrderEntry = (preset: Preset, layerUuid: string): PresetLayerOrder => {
  let entry = preset.layerOrder.find((item) => item.layerUuid === layerUuid);
  if (!entry) {
    preset.layerOrder.push({ layerUuid, sublayerUuids: [] });
    entry = preset.layerOrder[preset.layerOrder.length - 1];
  }
  return entry;
};

/** Remove a sublayer uuid from every layerOrder entry of a preset. */
const removeSublayerFromPresetLayerOrder = (preset: Preset, sublayerUuid: string): void => {
  for (const entry of preset.layerOrder) {
    const index = entry.sublayerUuids.indexOf(sublayerUuid);
    if (index >= 0) entry.sublayerUuids.splice(index, 1);
  }
};

/**
 * Insert/replace layers in the doc. Every preset gets a layerOrder entry for each new layer.
 */
export function applyUpsertLayers(m: Mission, layers: Layer[]): void {
  const now = getAccurateNow().getTime();
  for (const layer of layers) {
    const isNew = !(layer.uuid in m.layers);
    m.layers[layer.uuid] = cloneDeep(layer);
    if (!isNew) continue;
    for (const preset of Object.values(m.presets)) {
      getPresetLayerOrderEntry(preset, layer.uuid);
      preset.updatedAt = now;
    }
  }
  if (layers.some((layer) => layer.order !== undefined)) {
    for (const preset of Object.values(m.presets)) {
      const ordered = preset.layerOrder
        .map((entry) => ({ layerUuid: entry.layerUuid, sublayerUuids: [...entry.sublayerUuids] }))
        .sort(
          (a, b) =>
            (m.layers[a.layerUuid]?.order ?? Number.MAX_SAFE_INTEGER) -
            (m.layers[b.layerUuid]?.order ?? Number.MAX_SAFE_INTEGER)
        );
      preset.layerOrder.splice(0, preset.layerOrder.length, ...ordered);
      preset.updatedAt = now;
    }
  }
}

/**
 * Insert/replace sublayers in the doc and keep every preset in sync:
 * new sublayers get a hidden map control and a layerOrder slot, renamed sublayers update the
 * control's name, and sublayers that change layers move between layerOrder entries.
 */
export function applyUpsertSublayers(m: Mission, sublayers: Sublayer[]): void {
  const now = getAccurateNow().getTime();
  for (const sublayer of sublayers) {
    const previous = m.sublayers[sublayer.uuid];
    m.sublayers[sublayer.uuid] = cloneDeep(sublayer);
    for (const preset of Object.values(m.presets)) {
      let presetChanged = false;
      const control = preset.mapSublayerControls[sublayer.uuid];
      if (!control) {
        preset.mapSublayerControls[sublayer.uuid] = {
          name: sublayer.name,
          sublayerUuid: sublayer.uuid,
          visible: false,
          style: { ...defaultSublayerStyle },
        };
        presetChanged = true;
      } else if (control.name !== sublayer.name) {
        control.name = sublayer.name;
        presetChanged = true;
      }
      if (!previous || previous.layerUuid !== sublayer.layerUuid) {
        removeSublayerFromPresetLayerOrder(preset, sublayer.uuid);
        getPresetLayerOrderEntry(preset, sublayer.layerUuid).sublayerUuids.push(sublayer.uuid);
        presetChanged = true;
      }
      if (presetChanged) preset.updatedAt = now;
    }
  }
}

/** Delete sublayers and remove them from every preset. */
export function applyDeleteSublayers(m: Mission, sublayerUuids: string[]): void {
  const now = getAccurateNow().getTime();
  for (const sublayerUuid of sublayerUuids) {
    if (!(sublayerUuid in m.sublayers)) continue;
    delete m.sublayers[sublayerUuid];
    for (const preset of Object.values(m.presets)) {
      if (sublayerUuid in preset.mapSublayerControls) {
        delete preset.mapSublayerControls[sublayerUuid];
      }
      removeSublayerFromPresetLayerOrder(preset, sublayerUuid);
      preset.updatedAt = now;
    }
  }
}

/**
 * Delete layers together with their sublayers, and remove them from every preset and folder.
 */
export function applyDeleteLayers(m: Mission, layerUuids: string[]): void {
  const layerUuidSet = new Set(layerUuids);
  const sublayerUuids = Object.values(m.sublayers)
    .filter((sublayer) => layerUuidSet.has(sublayer.layerUuid))
    .map((sublayer) => sublayer.uuid);
  applyDeleteSublayers(m, sublayerUuids);

  const now = getAccurateNow().getTime();
  for (const layerUuid of layerUuids) {
    delete m.layers[layerUuid];
  }
  for (const preset of Object.values(m.presets)) {
    for (let index = preset.layerOrder.length - 1; index >= 0; index -= 1) {
      if (layerUuidSet.has(preset.layerOrder[index].layerUuid)) {
        preset.layerOrder.splice(index, 1);
        preset.updatedAt = now;
      }
    }
  }
  applyRemoveItemsFromAllFolders(m, layerUuids);
}
