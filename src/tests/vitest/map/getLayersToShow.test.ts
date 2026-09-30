/**
 * Tests for `getLayersToShow()` — pure function that computes visible sublayers
 * from a preset, mission sublayers, and optional datetime.
 */

import { describe, it, expect } from "vitest";
import { getLayersToShow } from "components/interface/map/utils/getLayersToShow";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { generateBlankPreset } from "store/storeUtils/preset";
import { v4 as uuidv4 } from "uuid";

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeLayer(name: string): Layer {
  return {
    uuid: uuidv4(),
    missionId: 1,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeStyle(): MapSublayerStyle {
  return {
    opacity: 1,
    contrast: 1,
    brightness: 1,
    saturation: 1,
    blendMode: "normal",
    color: "#000",
    weight: 1,
    fillColor: "#000",
    fillOpacity: 1,
    isDashed: false,
    dashLen: 0,
    altColor: "#000",
    altOpacity: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getLayersToShow", () => {
  it("returns empty array when preset is null", () => {
    const result = getLayersToShow({
      selectedPreset: null as unknown as Preset,
      missionSublayers: [],
      missionLayers: [],
      mapDateTime: null,
    });
    expect(result).toEqual([]);
  });

  it("returns empty array when sublayers is null", () => {
    const result = getLayersToShow({
      selectedPreset: generateBlankPreset(),
      missionSublayers: null as unknown as Sublayer[],
      missionLayers: [],
      mapDateTime: null,
    });
    expect(result).toEqual([]);
  });

  it("returns sublayers in layerOrder when preset has ordering", () => {
    const layer = makeLayer("Test Layer");
    const sub1 = generateBlankSublayer({ name: "Sub 1", layerUuid: layer.uuid });
    const sub2 = generateBlankSublayer({ name: "Sub 2", layerUuid: layer.uuid });
    const sub3 = generateBlankSublayer({ name: "Sub 3", layerUuid: layer.uuid });

    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sub2.uuid, sub1.uuid, sub3.uuid] }],
      mapSublayerControls: {
        [sub1.uuid]: {
          name: sub1.name,
          sublayerUuid: sub1.uuid,
          visible: true,
          style: makeStyle(),
        },
        [sub2.uuid]: {
          name: sub2.name,
          sublayerUuid: sub2.uuid,
          visible: true,
          style: makeStyle(),
        },
        [sub3.uuid]: {
          name: sub3.name,
          sublayerUuid: sub3.uuid,
          visible: true,
          style: makeStyle(),
        },
      },
    });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub1, sub2, sub3],
      missionLayers: [layer],
      mapDateTime: null,
    });

    expect(result).toHaveLength(3);
    // Order should match layerOrder: sub2, sub1, sub3
    expect(result[0].uuid).toBe(sub2.uuid);
    expect(result[1].uuid).toBe(sub1.uuid);
    expect(result[2].uuid).toBe(sub3.uuid);
  });

  it("filters out invisible sublayers via mapSublayerControls", () => {
    const layer = makeLayer("Test Layer");
    const sub1 = generateBlankSublayer({ name: "Visible", layerUuid: layer.uuid });
    const sub2 = generateBlankSublayer({ name: "Hidden", layerUuid: layer.uuid });

    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sub1.uuid, sub2.uuid] }],
      mapSublayerControls: {
        [sub1.uuid]: {
          name: sub1.name,
          sublayerUuid: sub1.uuid,
          visible: true,
          style: makeStyle(),
        },
        [sub2.uuid]: {
          name: sub2.name,
          sublayerUuid: sub2.uuid,
          visible: false,
          style: makeStyle(),
        },
      },
    });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub1, sub2],
      missionLayers: [layer],
      mapDateTime: null,
    });

    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe(sub1.uuid);
  });

  it("falls back to alphabetical when preset has no layerOrder", () => {
    const layerB = makeLayer("B Layer");
    const layerA = makeLayer("A Layer");
    const subB = generateBlankSublayer({ name: "Sub B", layerUuid: layerB.uuid });
    const subA = generateBlankSublayer({ name: "Sub A", layerUuid: layerA.uuid });

    const preset = generateBlankPreset({
      layerOrder: [], // empty = no ordering
      mapSublayerControls: {
        [subA.uuid]: {
          name: subA.name,
          sublayerUuid: subA.uuid,
          visible: true,
          style: makeStyle(),
        },
        [subB.uuid]: {
          name: subB.name,
          sublayerUuid: subB.uuid,
          visible: true,
          style: makeStyle(),
        },
      },
    });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [subB, subA],
      missionLayers: [layerB, layerA],
      mapDateTime: null,
    });

    expect(result).toHaveLength(2);
    // "A Layer" alphabetically before "B Layer"
    expect(result[0].uuid).toBe(subA.uuid);
    expect(result[1].uuid).toBe(subB.uuid);
  });

  it("handles empty sublayer list", () => {
    const preset = generateBlankPreset({ layerOrder: [] });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [],
      missionLayers: [],
      mapDateTime: null,
    });

    expect(result).toEqual([]);
  });

  it("resolves time-based sublayer to correct time slice", () => {
    const layer = makeLayer("Time Layer");
    const sub = generateBlankSublayer({
      name: "Time Sub",
      layerUuid: layer.uuid,
      path: "/tiles/time-layer",
      isTimeBased: true,
      timeLayerManifest: [
        {
          datetime: "2026-01-01T00:00:00.000Z",
          dirName: "2026-01-01",
          lowerBound: "2026-01-01T00:00:00.000Z",
          upperBound: "2026-01-15T12:00:00.000Z",
        },
        {
          datetime: "2026-01-30T00:00:00.000Z",
          dirName: "2026-01-30",
          lowerBound: "2026-01-15T12:00:00.000Z",
          upperBound: "2026-01-30T00:00:00.000Z",
        },
      ],
    });

    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sub.uuid] }],
      mapSublayerControls: {
        [sub.uuid]: { name: sub.name, sublayerUuid: sub.uuid, visible: true, style: makeStyle() },
      },
    });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub],
      missionLayers: [layer],
      mapDateTime: "2026-01-05T00:00:00.000Z", // within first time slice
    });

    expect(result).toHaveLength(1);
    expect(result[0].path).toContain("2026-01-01");
    expect(result[0].timeInfo).not.toBeNull();
  });

  it("selects nested temporal COGs without bridging explicit gaps", () => {
    const layer = makeLayer("Temporal Raster");
    const sub = generateBlankSublayer({
      name: "Temporal Raster",
      layerUuid: layer.uuid,
      path: "temporal-raster",
      isTimeBased: true,
      timeLayerManifest: [
        {
          datetime: "2030-01-01T00:15:00Z",
          dirName: "window-a/frame-a_cog.tif",
          lowerBound: "2030-01-01T00:07:30Z",
          upperBound: "2030-01-01T00:15:00Z",
        },
        {
          datetime: "2030-01-01T02:00:00Z",
          dirName: "window-b/frame-b_cog.tif",
          lowerBound: "2030-01-01T02:00:00Z",
          upperBound: "2030-01-01T02:07:30Z",
        },
      ],
    });
    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sub.uuid] }],
      mapSublayerControls: {
        [sub.uuid]: { name: sub.name, sublayerUuid: sub.uuid, visible: true, style: makeStyle() },
      },
    });

    const inWindowResult = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub],
      missionLayers: [layer],
      mapDateTime: "2030-01-01T00:10:00Z",
    });
    expect(inWindowResult).toHaveLength(1);
    expect(inWindowResult[0].path).toBe("temporal-raster/window-a/frame-a_cog.tif");

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub],
      missionLayers: [layer],
      mapDateTime: "2030-01-01T01:00:00Z",
    });

    expect(result).toEqual([]);
  });

  it("excludes time-based sublayers when datetime is outside bounds", () => {
    const layer = makeLayer("Time Layer");
    const sub = generateBlankSublayer({
      name: "Time Sub",
      layerUuid: layer.uuid,
      path: "/tiles/time-layer",
      isTimeBased: true,
      timeLayerManifest: [
        {
          datetime: "2026-01-15T00:00:00.000Z",
          dirName: "2026-01-15",
          lowerBound: "2026-01-15T00:00:00.000Z",
          upperBound: "2026-01-20T00:00:00.000Z",
        },
        {
          datetime: "2026-01-25T00:00:00.000Z",
          dirName: "2026-01-25",
          lowerBound: "2026-01-20T00:00:00.000Z",
          upperBound: "2026-01-25T00:00:00.000Z",
        },
      ],
    });

    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sub.uuid] }],
      mapSublayerControls: {
        [sub.uuid]: { name: sub.name, sublayerUuid: sub.uuid, visible: true, style: makeStyle() },
      },
    });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub],
      missionLayers: [layer],
      mapDateTime: "2025-06-01T00:00:00.000Z", // way before lower bound
    });

    expect(result).toHaveLength(0);
  });

  it("includes non-time-based sublayer regardless of datetime", () => {
    const layer = makeLayer("Normal Layer");
    const sub = generateBlankSublayer({
      name: "Regular Sub",
      layerUuid: layer.uuid,
      isTimeBased: false,
    });

    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sub.uuid] }],
      mapSublayerControls: {
        [sub.uuid]: { name: sub.name, sublayerUuid: sub.uuid, visible: true, style: makeStyle() },
      },
    });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub],
      missionLayers: [layer],
      mapDateTime: "2026-06-01T00:00:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0].timeInfo).toBeNull();
  });

  it("attaches visualStyle from preset to each returned sublayer", () => {
    const layer = makeLayer("Styled Layer");
    const sub = generateBlankSublayer({ name: "Styled Sub", layerUuid: layer.uuid });
    const style = makeStyle();
    style.brightness = 1.5;
    style.contrast = 0.8;

    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: layer.uuid, sublayerUuids: [sub.uuid] }],
      mapSublayerControls: {
        [sub.uuid]: { name: sub.name, sublayerUuid: sub.uuid, visible: true, style },
      },
    });

    const result = getLayersToShow({
      selectedPreset: preset,
      missionSublayers: [sub],
      missionLayers: [layer],
      mapDateTime: null,
    });

    expect(result[0].visualStyle.brightness).toBe(1.5);
    expect(result[0].visualStyle.contrast).toBe(0.8);
  });
});
