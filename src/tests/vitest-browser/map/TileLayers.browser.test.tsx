/**
 * Browser-mode tests for `TileLayers`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map + minimal Redux
 * store with `preset` + `mission` slices. `useCoordConverters` and
 * `useMissionDocSelector` are mocked because they pull from the Automerge
 * mission doc.
 *
 * Verifies:
 *  - Tile layers added when preset is selected and sublayer is visible
 *  - Layers removed when preset visibility toggled off
 *  - Z-ordering: top-of-list is highest z, capped below CIRCLES
 *  - Visual style updates (opacity) propagate to existing layers without rebuild
 *  - Preset hot-swap tears down and rebuilds all layers
 *  - Layers cleared on unmount
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import { flushSync } from "react-dom";
import TileLayer from "ol/layer/Tile";
import WebGLTileLayer from "ol/layer/WebGLTile";
import { VectorImage as VectorImageLayer } from "ol/layer";

import { MapContext } from "components/interface/map/MapProvider";
import { TileLayers } from "components/interface/map/behaviors/TileLayers";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { presetSlice, setPresetPreviewTime } from "store/preset";
import { missionSlice } from "store/mission";
import { interfaceSlice } from "store/interface";
import { evaSlice } from "store/eva";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankSublayer } from "store/storeUtils/sublayer";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

const mockMissionDoc: {
  id: number | null;
  projIsCustom: boolean;
  projResUnitsPerPixel: number | null;
  projResZoomLevel: number | null;
  projOriginX: number | null;
  projOriginY: number | null;
  projBoundsMinX: number | null;
  projBoundsMinY: number | null;
  projBoundsMaxX: number | null;
  projBoundsMaxY: number | null;
} = {
  id: 42,
  projIsCustom: false,
  projResUnitsPerPixel: null,
  projResZoomLevel: null,
  projOriginX: null,
  projOriginY: null,
  projBoundsMinX: null,
  projBoundsMinY: null,
  projBoundsMaxX: null,
  projBoundsMaxY: null,
};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUBLAYER_A_UUID = "sublayer-a";
const SUBLAYER_B_UUID = "sublayer-b";
const PRESET_UUID = "preset-1";
const PRESET_2_UUID = "preset-2";
const LAYER_UUID = "layer-uuid-1";

function makeStyle(overrides: Partial<MapSublayerStyle> = {}): MapSublayerStyle {
  return {
    opacity: 1,
    contrast: 1,
    brightness: 1,
    saturation: 1,
    blendMode: "normal",
    color: "#FFFFFF",
    weight: 1,
    fillColor: "none",
    fillOpacity: 0,
    isDashed: false,
    dashLen: 10,
    altColor: "#FFFFFF",
    altOpacity: 1,
    ...overrides,
  };
}

function makePreset(
  overrides: {
    uuid?: string;
    visibleUuids?: string[];
    layerOrder?: { sublayerUuids: string[] }[];
    styles?: Record<string, MapSublayerStyle>;
  } = {}
): Preset {
  const visibleUuids = overrides.visibleUuids ?? [SUBLAYER_A_UUID];
  const layerOrder = overrides.layerOrder ?? [
    { sublayerUuids: visibleUuids } as unknown as Preset["layerOrder"][number],
  ];
  const mapSublayerControls: Record<string, { visible: boolean; style: MapSublayerStyle }> = {};
  for (const u of visibleUuids) {
    mapSublayerControls[u] = {
      visible: true,
      style: overrides.styles?.[u] ?? makeStyle(),
    };
  }
  return generateBlankPreset({
    uuid: overrides.uuid ?? PRESET_UUID,
    name: "Test preset",
    layerOrder: layerOrder as unknown as Preset["layerOrder"],
    mapSublayerControls: mapSublayerControls as unknown as Preset["mapSublayerControls"],
  });
}

function makeTileSublayer(uuid: string, name = `Layer ${uuid.slice(-1)}`): Sublayer {
  return generateBlankSublayer({
    uuid,
    name,
    layerUuid: LAYER_UUID,
    type: "tile",
    path: `tiles/${uuid}`,
    tilePattern: "{z}/{x}/{y}.png",
    tileFormat: "xyz",
    missionId: 42,
  });
}

// A COG sublayer: type "tile" whose path points at a `.tif` inside its Layers/ folder. Routing to
// the WebGLTile/GeoTIFF path is driven by the `.tif` extension (there is no isCog flag).
function makeCogSublayer(uuid: string): Sublayer {
  return generateBlankSublayer({
    uuid,
    name: "COG Sublayer",
    layerUuid: LAYER_UUID,
    type: "tile",
    path: `${uuid}-elevation/${uuid}-elevation.tif`,
    missionId: 42,
  });
}

// Two-entry manifest so bounds calculations don't crash (single-entry manifests
// access manifest[index+1] unconditionally in getManifestTimeBounds).
const TIME_MANIFEST: TimeLayerInfo[] = [
  {
    datetime: "2024-01-01T00:00:00.000Z",
    dirName: "2024-01-01",
    lowerBound: "2024-01-01T00:00:00.000Z",
    upperBound: "2024-01-01T12:00:00.000Z",
  },
  {
    datetime: "2024-01-02T00:00:00.000Z",
    dirName: "2024-01-02",
    lowerBound: "2024-01-01T12:00:00.000Z",
    upperBound: "2024-01-02T00:00:00.000Z",
  },
];

function makeTimeBasedSublayer(uuid: string): Sublayer {
  return {
    ...generateBlankSublayer({
      uuid,
      name: "Time Sublayer",
      layerUuid: LAYER_UUID,
      type: "tile",
      path: `tiles/${uuid}`,
      tilePattern: "{z}/{x}/{y}.png",
      tileFormat: "xyz",
      missionId: 42,
    }),
    isTimeBased: true,
    timeLayerManifest: TIME_MANIFEST,
  };
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      preset: presetSlice.reducer,
      mission: missionSlice.reducer,
      interface: interfaceSlice.reducer,
      eva: evaSlice.reducer,
    },
    preloadedState,
  });
}

function preloaded({
  presets = [makePreset()],
  selectedPresetUuid = PRESET_UUID,
  sublayers = [makeTileSublayer(SUBLAYER_A_UUID)],
  layers = [
    {
      uuid: LAYER_UUID,
      name: "Test Layer",
      missionId: 42,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as Layer,
  ],
}: {
  presets?: Preset[];
  selectedPresetUuid?: string | null;
  sublayers?: Sublayer[];
  layers?: Layer[];
} = {}): PartialPreloadedState {
  return {
    preset: {
      ...presetSlice.getInitialState(),
      presets,
      selectedPresetUuid,
    },
    mission: {
      ...missionSlice.getInitialState(),
      layers,
      sublayers,
    },
  } as unknown as PartialPreloadedState;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

function findTileLayers(): TileLayer[] {
  return map
    .getLayers()
    .getArray()
    .filter((l) => l instanceof TileLayer) as TileLayer[];
}

function findWebGLTileLayers(): WebGLTileLayer[] {
  return map
    .getLayers()
    .getArray()
    .filter((l) => l instanceof WebGLTileLayer) as WebGLTileLayer[];
}

function findVectorImageLayers(): VectorImageLayer[] {
  return map
    .getLayers()
    .getArray()
    .filter((l) => l instanceof VectorImageLayer) as VectorImageLayer[];
}

function renderTileLayers(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <MapContext.Provider value={{ map, mode }}>
        <TileLayers />
      </MapContext.Provider>
    </Provider>
  );
}

beforeEach(() => {
  mockMissionDoc.id = 42;
  mockMissionDoc.projIsCustom = false;
  harness = createReactHarness();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });
});

afterEach(() => {
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TileLayers", () => {
  it("adds tile layers matching visible sublayers from the preset", () => {
    store = makeStore(preloaded());
    renderTileLayers();

    const layers = findTileLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].get("uuid")).toBe(SUBLAYER_A_UUID);
  });

  it("creates a WebGLTile (COG) layer for a sublayer with a .tif path", () => {
    // Stub fetch so the GeoTIFF source's eager remote read doesn't spam the console.
    const fetchStub = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => undefined));
    try {
      store = makeStore(preloaded({ sublayers: [makeCogSublayer(SUBLAYER_A_UUID)] }));
      renderTileLayers();

      // Routed to the COG path (WebGLTile), not the raster TileLayer path.
      expect(findTileLayers()).toHaveLength(0);
      const cogLayers = findWebGLTileLayers();
      expect(cogLayers).toHaveLength(1);
      expect(cogLayers[0].get("sublayerType")).toBe("cog");
      expect(cogLayers[0].get("uuid")).toBe(SUBLAYER_A_UUID);
    } finally {
      fetchStub.mockRestore();
    }
  });

  it("refreshes vector layers after their initial feature load", () => {
    const fetchStub = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise(() => undefined));
    try {
      const vectorSublayer = generateBlankSublayer({
        uuid: SUBLAYER_A_UUID,
        name: "Contours",
        layerUuid: LAYER_UUID,
        type: "vector",
        path: "contours.geojson",
        missionId: 42,
      });
      store = makeStore(
        preloaded({
          sublayers: [vectorSublayer],
          presets: [makePreset({ visibleUuids: [SUBLAYER_A_UUID] })],
        })
      );
      renderTileLayers();

      const layer = findVectorImageLayers()[0];
      const source = layer.getSource()!;
      const revisionBeforeLoad = layer.getRevision();

      source.dispatchEvent("featuresloadend");

      expect(layer.getRevision()).toBeGreaterThan(revisionBeforeLoad);
    } finally {
      fetchStub.mockRestore();
    }
  });

  it("does nothing without a selected preset", () => {
    store = makeStore(preloaded({ presets: [], selectedPresetUuid: null }));
    renderTileLayers();
    expect(findTileLayers()).toHaveLength(0);
  });

  it("does nothing when missionId is missing", () => {
    mockMissionDoc.id = null;
    store = makeStore(preloaded());
    renderTileLayers();
    expect(findTileLayers()).toHaveLength(0);
  });

  it("removes layers when sublayer visibility is toggled off", () => {
    const preset = makePreset({ visibleUuids: [SUBLAYER_A_UUID] });
    store = makeStore(
      preloaded({
        presets: [preset],
        sublayers: [makeTileSublayer(SUBLAYER_A_UUID)],
      })
    );
    renderTileLayers();
    expect(findTileLayers()).toHaveLength(1);

    flushSync(() => {
      store.dispatch(
        presetSlice.actions.togglePresetSublayerVisible({
          presetUuid: PRESET_UUID,
          layerUuid: SUBLAYER_A_UUID,
        })
      );
    });

    expect(findTileLayers()).toHaveLength(0);
  });

  it("orders layers so list-top has the highest z-index (capped below CIRCLES)", () => {
    // Two visible sublayers in the preset's layerOrder; first listed should be on top
    store = makeStore(
      preloaded({
        presets: [
          makePreset({
            visibleUuids: [SUBLAYER_A_UUID, SUBLAYER_B_UUID],
            layerOrder: [
              { sublayerUuids: [SUBLAYER_A_UUID, SUBLAYER_B_UUID] },
            ] as unknown as Preset["layerOrder"],
          }),
        ],
        sublayers: [makeTileSublayer(SUBLAYER_A_UUID, "A"), makeTileSublayer(SUBLAYER_B_UUID, "B")],
      })
    );
    renderTileLayers();

    const layers = findTileLayers();
    expect(layers).toHaveLength(2);
    const a = layers.find((l) => l.get("uuid") === SUBLAYER_A_UUID)!;
    const b = layers.find((l) => l.get("uuid") === SUBLAYER_B_UUID)!;

    // layerOrder index 0 (A) should be ON TOP of B
    expect(a.getZIndex()).toBeGreaterThan(b.getZIndex()!);
    // both must be below feature layers
    expect(a.getZIndex()).toBeLessThan(Z_INDEX.CIRCLES);
    expect(b.getZIndex()).toBeLessThan(Z_INDEX.CIRCLES);
  });

  it("applies opacity from preset visualStyle to the layer", () => {
    store = makeStore(
      preloaded({
        presets: [
          makePreset({
            visibleUuids: [SUBLAYER_A_UUID],
            styles: { [SUBLAYER_A_UUID]: makeStyle({ opacity: 0.4 }) },
          }),
        ],
      })
    );
    renderTileLayers();

    const layers = findTileLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].getOpacity()).toBeCloseTo(0.4);
  });

  it("updates opacity on existing layer without recreating it", () => {
    store = makeStore(preloaded());
    renderTileLayers();
    const layerBefore = findTileLayers()[0];
    expect(layerBefore.getOpacity()).toBe(1);

    flushSync(() => {
      store.dispatch(
        presetSlice.actions.setPresetSublayerStyle({
          presetUuid: PRESET_UUID,
          layerUuid: SUBLAYER_A_UUID,
          style: makeStyle({ opacity: 0.25 }),
        })
      );
    });

    const layerAfter = findTileLayers()[0];
    expect(layerAfter).toBe(layerBefore); // same instance
    expect(layerAfter.getOpacity()).toBeCloseTo(0.25);
  });

  it("preset hot-swap rebuilds all layers (different layer instances)", () => {
    const preset1 = makePreset({ uuid: PRESET_UUID, visibleUuids: [SUBLAYER_A_UUID] });
    const preset2 = makePreset({ uuid: PRESET_2_UUID, visibleUuids: [SUBLAYER_A_UUID] });

    store = makeStore(
      preloaded({
        presets: [preset1, preset2],
        selectedPresetUuid: PRESET_UUID,
        sublayers: [makeTileSublayer(SUBLAYER_A_UUID)],
      })
    );
    renderTileLayers();
    const layerBefore = findTileLayers()[0];
    expect(layerBefore.get("uuid")).toBe(SUBLAYER_A_UUID);

    flushSync(() => {
      store.dispatch(presetSlice.actions.setSelectedPresetUuid(PRESET_2_UUID));
    });

    const layerAfter = findTileLayers()[0];
    expect(layerAfter).not.toBe(layerBefore); // rebuilt
    expect(layerAfter.get("uuid")).toBe(SUBLAYER_A_UUID);
  });

  it("removes all tile layers from the map on unmount", () => {
    store = makeStore(preloaded());
    renderTileLayers();
    expect(findTileLayers()).toHaveLength(1);

    harness.unmount();
    harness = createReactHarness();

    expect(findTileLayers()).toHaveLength(0);
  });

  it("time-based layer is shown when mapDateTime is within manifest bounds", () => {
    const timeSubUuid = "sublayer-time";
    store = makeStore(
      preloaded({
        presets: [makePreset({ visibleUuids: [timeSubUuid] })],
        sublayers: [makeTimeBasedSublayer(timeSubUuid)],
      })
    );

    // Set sectionSelected=preset + presetPreviewTime so useMapDateTime returns a
    // datetime within the first manifest entry's bounds.
    flushSync(() => {
      store.dispatch(interfaceSlice.actions.setSectionSelected("preset"));
      store.dispatch(setPresetPreviewTime({ presetPreviewTime: "2024-01-01T06:00:00.000Z" }));
    });

    renderTileLayers();
    expect(findTileLayers()).toHaveLength(1);
  });

  it("time-based layer is hidden when mapDateTime is out of manifest bounds", () => {
    const timeSubUuid = "sublayer-time-oob";
    store = makeStore(
      preloaded({
        presets: [makePreset({ visibleUuids: [timeSubUuid] })],
        sublayers: [makeTimeBasedSublayer(timeSubUuid)],
      })
    );

    // DateTime before the earliest bound (2024-01-01T00:00:00Z) → out of bounds
    flushSync(() => {
      store.dispatch(interfaceSlice.actions.setSectionSelected("preset"));
      store.dispatch(setPresetPreviewTime({ presetPreviewTime: "2023-12-31T00:00:00.000Z" }));
    });

    renderTileLayers();
    expect(findTileLayers()).toHaveLength(0);
  });

  it("time-based layer disappears when mapDateTime moves out of bounds", () => {
    const timeSubUuid = "sublayer-time-toggle";
    store = makeStore(
      preloaded({
        presets: [makePreset({ visibleUuids: [timeSubUuid] })],
        sublayers: [makeTimeBasedSublayer(timeSubUuid)],
      })
    );

    flushSync(() => {
      store.dispatch(interfaceSlice.actions.setSectionSelected("preset"));
      store.dispatch(setPresetPreviewTime({ presetPreviewTime: "2024-01-01T06:00:00.000Z" }));
    });

    renderTileLayers();
    expect(findTileLayers()).toHaveLength(1);

    // Move time before the manifest starts → layer should disappear
    flushSync(() => {
      store.dispatch(setPresetPreviewTime({ presetPreviewTime: "2023-12-31T00:00:00.000Z" }));
    });

    expect(findTileLayers()).toHaveLength(0);
  });

  it("rebuilds the tile source when the time slice changes within bounds", () => {
    const timeSubUuid = "sublayer-time-slice";
    store = makeStore(
      preloaded({
        presets: [makePreset({ visibleUuids: [timeSubUuid] })],
        sublayers: [makeTimeBasedSublayer(timeSubUuid)],
      })
    );

    // Start within the first manifest entry's bounds → dirName "2024-01-01"
    flushSync(() => {
      store.dispatch(interfaceSlice.actions.setSectionSelected("preset"));
      store.dispatch(setPresetPreviewTime({ presetPreviewTime: "2024-01-01T06:00:00.000Z" }));
    });
    renderTileLayers();

    const firstSlice = findTileLayers();
    expect(firstSlice).toHaveLength(1);
    const firstUrl = (firstSlice[0].getSource() as { getUrls?: () => string[] }).getUrls?.()?.[0];
    expect(firstUrl).toContain("/2024-01-01/");

    // Move the slider into the second manifest entry's bounds → dirName
    // "2024-01-02". The layer keeps the same uuid, so the source URL must be
    // rebuilt to point at the new time slice.
    flushSync(() => {
      store.dispatch(setPresetPreviewTime({ presetPreviewTime: "2024-01-01T18:00:00.000Z" }));
    });

    const secondSlice = findTileLayers();
    expect(secondSlice).toHaveLength(1);
    const secondUrl = (secondSlice[0].getSource() as { getUrls?: () => string[] }).getUrls?.()?.[0];
    expect(secondUrl).toContain("/2024-01-02/");
    expect(secondUrl).not.toContain("/2024-01-01/");
  });
});
