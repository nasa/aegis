/**
 * Browser-mode tests for `Grid`.
 *
 * Mocks:
 *  - `useCoordConverters` — avoids Automerge dependency
 *  - `utils/useDocSelector` — provides mutable planetRadius
 *  - `useResolvedMissionGrid` — provides a mutable resolved-grid fixture
 *  - `utils/mapping/geoMath` — stubs `findClosestPointInGlobalGrid` /
 *    `adjustGridIndex` so test assertions don't depend on real geometry math
 *
 * Verifies:
 *  - Adds GRID_LINES and GRID_LABELS layers on mount
 *  - Both layers cleared when globalGrid is null
 *  - Both layers cleared when mapGridControl.visible=false
 *  - Line features added when grid is set and control is visible
 *  - Label features suppressed when labelsVisible=false
 *  - Label features added when labelsVisible=true and gridLabelsEnabled (editor mode)
 *  - Layers removed on unmount
 *  - Dashboard publishes the spacing it drew; minimap redraws at that spacing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { Provider } from "react-redux";
import { CookiesProvider, Cookies } from "react-cookie";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { MapContext } from "components/interface/map/MapProvider";
import { MapMenuProvider } from "components/interface/map/MapMenuProvider";
import {
  DashboardBoundsProvider,
  useDashboardBoundsContext,
  type DashboardBoundsContextValue,
} from "components/interface/map/DashboardBoundsProvider";
import { Grid } from "components/interface/map/behaviors/Grid";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { presetSlice } from "store/preset";
import { interfaceSlice } from "store/interface";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

const mockMissionDoc: Partial<Mission> = {
  planetRadius: 1737400,
  projIsCustom: true,
  projProj4String:
    "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=1737400 +b=1737400 +units=m +no_defs",
  gridRenderMode: "server-file",
};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc),
  useDocSelector: (): undefined => undefined,
}));

// Mutable globalGrid fixture — vi.hoisted() so it's available inside the mock factory.
const mockGrid = vi.hoisted(() => ({ current: null as MissionGrid | null }));

vi.mock("components/interface/map/hooks/useResolvedMissionGrid", () => ({
  useResolvedMissionGrid: (): ResolvedMissionGrid => {
    if (mockMissionDoc.gridRenderMode === "dynamic-lgrs") return { kind: "dynamic-lgrs" };
    return mockGrid.current ? { kind: "server-file", grid: mockGrid.current } : { kind: "none" };
  },
}));

// Metres between adjacent grid points. 0 (the default) disables every
// spacing-derived branch.
const mockBaseSpacing = vi.hoisted(() => ({ current: 0 }));

// Use a stable Proxy as the exported globalGrid value.
// Since the ESM binding captures the proxy reference (never null), it passes
// the `!globalGrid` guard in the component.  The proxy's property traps then
// delegate to mockGrid.current at CALL TIME, making the fixture mutable.
vi.mock("utils/mapping/grid", () => {
  const globalGridProxy = new Proxy({} as MissionGrid, {
    get(_target, prop: string) {
      const current = mockGrid.current;
      if (!current) return undefined;
      return (current as Record<string, unknown>)[prop];
    },
    has(_target, prop) {
      return mockGrid.current != null && prop in mockGrid.current;
    },
  });
  return {
    globalGrid: globalGridProxy,
    loadAndReturnGrid: async (): Promise<null> => null,
    getGridBaseSpacingMeters: () => mockBaseSpacing.current,
  };
});

// Call counter so findClosestPointInGlobalGrid returns distinct start/end indices.
// Reset to 0 in beforeEach so each render gets a clean pair of calls.
const geoMathCalls = vi.hoisted(() => ({ count: 0 }));

// Stub geoMath so Grid can compute grid indices without real geometry.
// Returns { row:0, col:0 } on even calls (topLeft) and { row:N-1, col:M-1 } on
// odd calls (bottomRight), giving basePointsShown > 0 so labelZoomLevel ≥ 1.
vi.mock("utils/mapping/geoMath", () => ({
  findClosestPointInGlobalGrid: (
    _coords: unknown[][],
    _point: unknown,
    _radius: unknown
  ): { row: number; col: number } | null => {
    if (!mockGrid.current?.coordinates) return null;
    const numRows = mockGrid.current.coordinates.length;
    const numCols = mockGrid.current.coordinates[0].length;
    const isTopLeft = geoMathCalls.count % 2 === 0;
    geoMathCalls.count++;
    return isTopLeft ? { row: 0, col: 0 } : { row: numRows - 1, col: numCols - 1 };
  },
  adjustGridIndex: (
    _idx: { row: number; col: number },
    numRows: number,
    numCols: number,
    _step: number,
    _isStart: boolean
  ): { row: number; col: number } => {
    // Return clamped corners so all rows/cols are covered
    if (_isStart) return { row: 0, col: 0 };
    return { row: numRows - 1, col: numCols - 1 };
  },
  // passthrough other exports used elsewhere
  getTotalDistance: (..._args: unknown[]) => 0,
  getBearingFromLatLngPoints: (..._args: unknown[]) => 0,
  getGridCoordinatesFromPoint: (..._args: unknown[]): null => null,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRESET_UUID = "preset-uuid-grid";

function makeGridControl(visible: boolean, labelsVisible: boolean): MapGridControl {
  return {
    visible,
    labelsVisible,
    style: {
      opacity: 100,
      contrast: 0,
      brightness: 0,
      saturation: 0,
      blendMode: "normal",
      color: "#ffffff",
      weight: 1,
      fillColor: "",
      fillOpacity: 0,
      isDashed: false,
      dashLen: 0,
      altColor: "",
      altOpacity: 1,
    },
  };
}

/**
 * Build a minimal 3×3 MissionGrid with named grid points.
 * Grid needs at least 2 rows and 2 cols to draw any lines.
 */
function makeGrid(rows = 3, cols = 3): MissionGrid {
  const coordinates: MissionGridPoint[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: MissionGridPoint[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        id: r * cols + c,
        index: { row: r, col: c },
        coordinates: { lat: r * 10, lng: c * 10 },
        name: `A${r}-${c}`,
      });
    }
    coordinates.push(row);
  }
  return {
    gridDefinition: {
      numRows: rows,
      numCols: cols,
      name: "Test Grid",
      fileName: "test.json",
    },
    coordinates,
  };
}

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

/** Preloaded preset state with a visible, labelled grid. */
function visibleGridState(): PartialPreloadedState {
  return {
    preset: {
      ...presetSlice.getInitialState(),
      selectedPresetUuid: PRESET_UUID,
      presets: [
        {
          uuid: PRESET_UUID,
          mapGridControl: makeGridControl(true, true),
        } as unknown as Preset,
      ],
    },
  } as PartialPreloadedState;
}

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      preset: presetSlice.reducer,
      interface: interfaceSlice.reducer,
    },
    preloadedState,
  });
}

// ---------------------------------------------------------------------------
// Harness state
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

function renderGrid(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <CookiesProvider cookies={new Cookies()}>
        <MapMenuProvider>
          <MapContext.Provider value={{ map, mode }}>
            <Grid />
          </MapContext.Provider>
        </MapMenuProvider>
      </CookiesProvider>
    </Provider>
  );
}

/** Renders Grid inside a DashboardBoundsProvider and exposes that context via `bounds.ctx`. */
const bounds: { ctx: DashboardBoundsContextValue | null } = { ctx: null };

function captureBounds(ctx: DashboardBoundsContextValue): void {
  bounds.ctx = ctx;
}

function BoundsProbe(): null {
  const ctx = useDashboardBoundsContext();
  useEffect(() => captureBounds(ctx), [ctx]);
  return null;
}

function gridInBoundsTree(mode: "dashboard" | "minimap"): JSX.Element {
  return (
    <Provider store={store}>
      <CookiesProvider cookies={new Cookies()}>
        <DashboardBoundsProvider>
          <BoundsProbe />
          <MapMenuProvider>
            <MapContext.Provider value={{ map, mode }}>
              <Grid />
            </MapContext.Provider>
          </MapMenuProvider>
        </DashboardBoundsProvider>
      </CookiesProvider>
    </Provider>
  );
}

function renderGridInBounds(mode: "dashboard" | "minimap") {
  harness.render(gridInBoundsTree(mode));
}

/** Lets React flush the state update Grid publishes from its effect. */
function flushPublish(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function lineFeatureCount(): number {
  return findLayerAtZIndex(Z_INDEX.GRID_LINES)!.getSource()!.getFeatures().length;
}

function findLayerAtZIndex(zIndex: number): VectorLayer<VectorSource> | null {
  return (
    (map
      .getLayers()
      .getArray()
      .find((l) => l.getZIndex() === zIndex) as VectorLayer<VectorSource> | undefined) ?? null
  );
}

beforeEach(() => {
  mockGrid.current = null;
  mockMissionDoc.gridRenderMode = "server-file";
  mockBaseSpacing.current = 0;
  bounds.ctx = null;
  geoMathCalls.count = 0;
  harness = createReactHarness();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1, zoom: 5 }),
  });
  // Force layout so map.getSize() returns a valid size inside rebuildGrid
  map.updateSize();
  map.renderSync();

  store = makeStore();
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

describe("Grid", () => {
  it("adds GRID_LINES and GRID_LABELS layers on mount", () => {
    renderGrid();
    expect(findLayerAtZIndex(Z_INDEX.GRID_LINES)).not.toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.GRID_LABELS)).not.toBeNull();
  });

  it("line source is empty when globalGrid is null", () => {
    mockGrid.current = null;
    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapGridControl: makeGridControl(true, false),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderGrid();
    const lineLayer = findLayerAtZIndex(Z_INDEX.GRID_LINES)!;
    expect(lineLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("line source is empty when mapGridControl.visible=false", () => {
    mockGrid.current = makeGrid();
    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapGridControl: makeGridControl(false, false),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderGrid();
    const lineLayer = findLayerAtZIndex(Z_INDEX.GRID_LINES)!;
    expect(lineLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("line source is empty when no preset is selected", () => {
    mockGrid.current = makeGrid();
    // no presets → no mapGridControl
    renderGrid();
    const lineLayer = findLayerAtZIndex(Z_INDEX.GRID_LINES)!;
    expect(lineLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("adds line features when grid is set and control is visible", () => {
    mockGrid.current = makeGrid(3, 3);
    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapGridControl: makeGridControl(true, false),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderGrid();
    const lineLayer = findLayerAtZIndex(Z_INDEX.GRID_LINES)!;
    // 3 rows + 3 cols = 6 line features for a 3×3 grid
    expect(lineLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);
  });

  it("adds dynamic lines and labels without a server grid", () => {
    mockMissionDoc.gridRenderMode = "dynamic-lgrs";
    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapGridControl: makeGridControl(true, true),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderGrid();

    expect(
      findLayerAtZIndex(Z_INDEX.GRID_LINES)!.getSource()!.getFeatures().length
    ).toBeGreaterThan(0);
    expect(
      findLayerAtZIndex(Z_INDEX.GRID_LABELS)!.getSource()!.getFeatures().length
    ).toBeGreaterThan(0);
  });

  it("label source is empty when labelsVisible=false", () => {
    mockGrid.current = makeGrid(3, 3);
    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapGridControl: makeGridControl(true, false),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderGrid(); // editor mode → gridLabelsEnabled=true
    const labelLayer = findLayerAtZIndex(Z_INDEX.GRID_LABELS)!;
    expect(labelLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("adds label features in editor mode when labelsVisible=true", () => {
    mockGrid.current = makeGrid(3, 3);
    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapGridControl: makeGridControl(true, true),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderGrid("editor"); // gridLabelsEnabled=true in editor
    const labelLayer = findLayerAtZIndex(Z_INDEX.GRID_LABELS)!;
    expect(labelLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);
  });

  it("label source is empty in minimap mode (gridLabelsEnabled=false)", () => {
    mockGrid.current = makeGrid(3, 3);
    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapGridControl: makeGridControl(true, true),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderGrid("minimap"); // gridLabelsEnabled=false for minimap
    const labelLayer = findLayerAtZIndex(Z_INDEX.GRID_LABELS)!;
    expect(labelLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("dashboard publishes the spacing it drew", async () => {
    mockGrid.current = makeGrid(3, 3);
    mockBaseSpacing.current = 10;
    store = makeStore(visibleGridState());

    renderGridInBounds("dashboard");

    // 3×3 grid over the whole viewport → stride 1 → spacing == base spacing.
    await flushPublish();

    expect(bounds.ctx!.gridSpacing).toEqual({ line: 10, label: 10 });
  });

  it("minimap draws the dashboard's spacing instead of its own", async () => {
    mockGrid.current = makeGrid(3, 3);
    mockBaseSpacing.current = 10;
    store = makeStore(visibleGridState());

    renderGridInBounds("minimap");
    // Auto density on a 3×3 grid → stride 1 → 3 rows + 3 cols.
    expect(lineFeatureCount()).toBe(6);

    const { flushSync } = await import("react-dom");
    flushSync(() => bounds.ctx!.setGridSpacing({ line: 20, label: 20 }));
    renderGridInBounds("minimap");

    // 20 m spacing over a 10 m grid → stride 2 → 2 rows + 2 cols.
    expect(lineFeatureCount()).toBe(4);
  });

  it("dashboard publishes a dynamic-lgrs spacing", async () => {
    mockMissionDoc.gridRenderMode = "dynamic-lgrs";
    store = makeStore(visibleGridState());

    renderGridInBounds("dashboard");
    await flushPublish();

    expect(bounds.ctx!.gridSpacing!.line).toBeGreaterThan(0);
    expect(bounds.ctx!.gridSpacing!.label).toBeGreaterThanOrEqual(bounds.ctx!.gridSpacing!.line);
  });

  it("removes both layers on unmount", () => {
    renderGrid();
    expect(findLayerAtZIndex(Z_INDEX.GRID_LINES)).not.toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.GRID_LABELS)).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findLayerAtZIndex(Z_INDEX.GRID_LINES)).toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.GRID_LABELS)).toBeNull();
  });
});
