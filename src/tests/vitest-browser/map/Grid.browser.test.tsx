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
 *  - Dynamic LGRS on south/north polar, Web Mercator (Apollo 14-like) and zone-seam views,
 *    heavier seam strokes, cached label styles, and the compatibility gate
 *  - Earth grid: the Texas 14/15 zone seam in ACC and MGRS, the Iceland 64° N band boundary,
 *    the 84° N UTM/UPS seam, a band-split box (readout band ≠ box label band), a live scheme
 *    switch, and a minimap ignoring a spacing published under another system key
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { Provider } from "react-redux";
import { CookiesProvider, Cookies } from "react-cookie";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import type Feature from "ol/Feature";
import type { LineString } from "ol/geom";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { Style } from "ol/style";
import { register } from "ol/proj/proj4";
import proj4 from "proj4";

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
import { interfaceSlice, setGridLabelSchemeOverride } from "store/interface";
import { formatLgrsFromLatLon } from "utils/lgrs/display";
import { getUtmCrsId, EARTH_CRS_UPS_NORTH } from "utils/lgrs/earth/zones";
import { createLgrsRenderPlan } from "utils/lgrs/grid/plan";
import { getLgrsGridBinding } from "utils/lgrs/gridBinding";
import { getLgrsMapProjection } from "utils/lgrs/mapProjection";
import { getLtmCrsId, LGRS_CRS_LPS_NORTH } from "utils/lgrs/moon/crs";
import { resolveMissionGridSystem } from "utils/lgrs/system";
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

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const SOUTH_CAP = `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;
const NORTH_CAP = `+proj=stere +lat_0=90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;
// EPSG:32661, the UPS North grid CRS.
const UPS_NORTH =
  "+proj=stere +lat_0=90 +lat_ts=90 +lon_0=0 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs";

const mockMissionDoc: Partial<Mission> = {
  id: 1,
  planetRadius: 1737400,
  projIsCustom: true,
  projEpsg: "TEST:SOUTH",
  projProj4String: SOUTH_CAP,
  gridRenderMode: "server-file",
};

proj4.defs("TEST:SOUTH", SOUTH_CAP);
proj4.defs("TEST:NORTH", NORTH_CAP);
proj4.defs("TEST:UPS-NORTH", UPS_NORTH);
register(proj4);

/** Mission projections used by the dynamic LGRS cases. */
const PROJECTIONS = {
  south: { projIsCustom: true, projEpsg: "TEST:SOUTH", projProj4String: SOUTH_CAP },
  north: { projIsCustom: true, projEpsg: "TEST:NORTH", projProj4String: NORTH_CAP },
  // The Apollo 14 seed: Web Mercator map with lunar lat/lon.
  mercator: { projIsCustom: false, projEpsg: "EPSG:3857", projProj4String: "" },
  upsNorth: { projIsCustom: true, projEpsg: "TEST:UPS-NORTH", projProj4String: UPS_NORTH },
} satisfies Record<string, Pick<Mission, "projIsCustom" | "projEpsg" | "projProj4String">>;

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

/**
 * Presets and folders live in the mission doc, so move any seeded into the preloaded Redux
 * state over to the mocked doc. Folder UI state is a map keyed by folder uuid.
 */
function moveDocEntitiesToMockDoc(preloadedState: PartialPreloadedState): PartialPreloadedState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = { ...(preloadedState as any) };
  if (state.preset?.presets) {
    const { presets, ...presetState } = state.preset;
    (mockMissionDoc as Partial<Mission>).presets = Object.fromEntries(
      (presets as Preset[]).map((preset) => [preset.uuid, preset])
    );
    state.preset = presetState;
  } else {
    (mockMissionDoc as Partial<Mission>).presets = {};
  }
  if (state.interface?.folders || Array.isArray(state.interface?.foldersInterface)) {
    const { folders = [], foldersInterface = [], ...interfaceState } = state.interface;
    (mockMissionDoc as Partial<Mission>).folders = Object.fromEntries(
      (folders as Folder[]).map((folder) => [folder.uuid, folder])
    );
    state.interface = {
      ...interfaceState,
      foldersInterface: Object.fromEntries(
        (foldersInterface as FolderInterface[]).map((folderInterface) => [
          folderInterface.uuid,
          folderInterface,
        ])
      ),
    };
  } else {
    (mockMissionDoc as Partial<Mission>).folders = {};
  }
  return state as PartialPreloadedState;
}

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      preset: presetSlice.reducer,
      interface: interfaceSlice.reducer,
    },
    preloadedState: moveDocEntitiesToMockDoc(preloadedState),
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

function lineFeatures(): Feature<LineString>[] {
  return findLayerAtZIndex(Z_INDEX.GRID_LINES)!.getSource()!.getFeatures() as Feature<LineString>[];
}

function labelStyles(): Style[] {
  return findLayerAtZIndex(Z_INDEX.GRID_LABELS)!
    .getSource()!
    .getFeatures()
    .map((feature) => feature.getStyle() as Style);
}

function labelTexts(): string[] {
  return labelStyles().map((style) => style.getText()!.getText() as string);
}

/** Switches the mission to dynamic LGRS and centres the view on `[lat, lon]`. */
function setDynamicView(
  projection: keyof typeof PROJECTIONS,
  lat: number,
  lon: number,
  resolution: number
): void {
  Object.assign(mockMissionDoc, PROJECTIONS[projection]);
  mockMissionDoc.gridRenderMode = "dynamic-lgrs";
  const code = PROJECTIONS[projection].projEpsg;
  map.setView(
    new View({ projection: code, center: proj4("EPSG:4326", code, [lon, lat]), resolution })
  );
  map.renderSync();
}

/** The mock mission's grid binding, in its default label scheme. */
function missionBinding(): LgrsGridBinding {
  return getLgrsGridBinding(
    getLgrsMapProjection(mockMissionDoc as Mission),
    resolveMissionGridSystem(mockMissionDoc as Mission)
  );
}

/** The plan Grid should have drawn for the current view. */
function planForView(overrides: Partial<LgrsRenderOptions> = {}): LgrsRenderPlan {
  const extent = map.getView().calculateExtent(map.getSize());
  return createLgrsRenderPlan({
    binding: missionBinding(),
    extent: [extent[0], extent[1], extent[2], extent[3]],
    resolution: map.getView().getResolution()!,
    gridSpacingMode: "auto",
    gridLabelInterval: "auto",
    labelsVisible: true,
    ...overrides,
  });
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
  mockMissionDoc.planetRadius = 1737400;
  mockMissionDoc.gridSystem = undefined;
  mockMissionDoc.earthGridLabelScheme = undefined;
  Object.assign(mockMissionDoc, PROJECTIONS.south);
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

describe("Grid dynamic LGRS", () => {
  beforeEach(() => {
    store = makeStore(visibleGridState());
  });

  it("draws two-vertex lines on the canonical south LPS mission", () => {
    setDynamicView("south", -89.99, 0, 1);
    renderGrid();

    const plan = planForView();
    expect(plan.tier).toBe("box");
    expect(lineFeatures()).toHaveLength(plan.lines.length);
    expect(lineFeatures().every((f) => f.getGeometry()!.getCoordinates().length === 2)).toBe(true);
    expect(labelTexts().sort()).toEqual(plan.labels.map((label) => label.text).sort());
    expect(labelTexts().length).toBeGreaterThan(0);
  });

  it("draws the grid on a north-pole mission", () => {
    setDynamicView("north", 89.99, 0, 1);
    renderGrid();

    const plan = planForView();
    expect(plan.regions).toEqual([LGRS_CRS_LPS_NORTH]);
    expect(lineFeatures().length).toBeGreaterThan(0);
    expect(lineFeatures()).toHaveLength(plan.lines.length);
    expect(labelTexts().sort()).toEqual(plan.labels.map((label) => label.text).sort());
    expect(plan.labels.every((label) => /^[YZ]/.test(label.label!.prefix))).toBe(true);
  });

  it("draws an Apollo 14-like Web Mercator mission in LTM zone 21S", () => {
    setDynamicView("mercator", -3.6, -17.5, 40);
    renderGrid();

    const plan = planForView();
    expect(plan.regions).toEqual([getLtmCrsId(21, "S")]);
    expect(lineFeatures().length).toBeGreaterThan(0);
    expect(lineFeatures()).toHaveLength(plan.lines.length);
    expect(labelTexts().sort()).toEqual(plan.labels.map((label) => label.text).sort());
    expect(plan.labels.every((label) => label.label!.prefix.startsWith("21M"))).toBe(true);
  });

  it("stops lines at a zone seam and strokes the seam heavier", () => {
    setDynamicView("mercator", -3.6, -20, 300);
    renderGrid();

    const plan = planForView();
    expect(plan.regions).toEqual(
      expect.arrayContaining([getLtmCrsId(20, "S"), getLtmCrsId(21, "S")])
    );
    const widths = lineFeatures().map((f) => (f.getStyle() as Style).getStroke()!.getWidth()!);
    const seams = plan.lines.filter((line) => line.kind === "seam");
    expect(seams.length).toBeGreaterThan(0);
    expect(widths.filter((width) => width > 1)).toHaveLength(seams.length);
    expect(widths.filter((width) => width === 1)).toHaveLength(plan.lines.length - seams.length);
  });

  it("reuses one label style per text across rebuilds", () => {
    setDynamicView("south", -89.99, 0, 1);
    renderGrid();
    const before = new globalThis.Map(labelTexts().map((text, i) => [text, labelStyles()[i]]));

    map.dispatchEvent("moveend");

    const after = labelStyles();
    expect(after.length).toBe(before.size);
    labelTexts().forEach((text, i) => expect(after[i]).toBe(before.get(text)));
  });

  it("draws nothing for a mission off the lunar sphere radius", () => {
    setDynamicView("south", -89.99, 0, 1);
    mockMissionDoc.planetRadius = 1737000;
    renderGrid();

    expect(lineFeatures()).toHaveLength(0);
  });

  it("minimap draws the dashboard's dynamic spacing", async () => {
    setDynamicView("south", -89.99, 0, 1);
    renderGridInBounds("minimap");
    const own = planForView({ labelsVisible: false });
    expect(lineFeatureCount()).toBe(own.lines.length);

    const { flushSync } = await import("react-dom");
    flushSync(() => bounds.ctx!.setGridSpacing({ line: 100, label: 100 }));
    renderGridInBounds("minimap");

    const inherited = planForView({
      labelsVisible: false,
      inheritedSpacing: { line: 100, label: 100 },
    });
    expect(inherited.lineSpacing).toBe(100);
    expect(lineFeatureCount()).toBe(inherited.lines.length);
    expect(inherited.lines.length).toBeLessThan(own.lines.length);
  });
});

describe("Grid dynamic Earth grid", () => {
  const MENU_COOKIE = "AEGIS_Map_Menu_Settings";
  const latLon = new Float64Array(2);
  const utm = (zone: number) => getUtmCrsId(zone, "N");

  beforeEach(() => {
    store = makeStore(visibleGridState());
  });

  afterEach(() => {
    new Cookies().remove(MENU_COOKIE, { path: "/" });
  });

  /** Switches the mission to the Earth grid in `scheme` and centres the view on `[lat, lon]`. */
  function setEarthView(
    projection: keyof typeof PROJECTIONS,
    lat: number,
    lon: number,
    resolution: number,
    scheme: GridLabelScheme = "lunar-acc"
  ): void {
    mockMissionDoc.planetRadius = 6378137;
    mockMissionDoc.gridSystem = "earth-wgs84";
    mockMissionDoc.earthGridLabelScheme = scheme;
    setDynamicView(projection, lat, lon, resolution);
  }

  /** Saves a fixed line and label spacing in the map menu cookie, read when the menu mounts. */
  function saveFixedSpacing(spacing: number): void {
    new Cookies().set(
      MENU_COOKIE,
      { gridSpacingMode: spacing, gridLabelInterval: spacing },
      { path: "/" }
    );
  }

  /** Latitudes of a drawn line's vertices. */
  function lineLatitudes(line: LgrsRenderLine): number[] {
    const binding = missionBinding();
    const lats: number[] = [];
    for (let i = 0; i < line.coordinates.length; i += 2) {
      expect(binding.mapToLatLon(line.coordinates[i], line.coordinates[i + 1], latLon)).toBe(true);
      lats.push(latLon[0]);
    }
    return lats;
  }

  /** Longitudes of a drawn line's two ends. */
  function endLongitudes(line: LgrsRenderLine): [number, number] {
    const binding = missionBinding();
    const last = line.coordinates.length - 2;
    binding.mapToLatLon(line.coordinates[0], line.coordinates[1], latLon);
    const start = latLon[1];
    binding.mapToLatLon(line.coordinates[last], line.coordinates[last + 1], latLon);
    return [start, latLon[1]];
  }

  /** The drawn features match the plan line for line, with seams stroked heavier. */
  function expectDrawnPlan(plan: LgrsRenderPlan): void {
    expect(plan.tier).toBe("box");
    const drawn = new globalThis.Map(
      lineFeatures().map((feature) => [
        feature.getGeometry()!.getFlatCoordinates().join(),
        (feature.getStyle() as Style).getStroke()!.getWidth()!,
      ])
    );
    expect(drawn.size).toBe(plan.lines.length);
    for (const line of plan.lines) {
      const width = drawn.get(line.coordinates.join());
      expect(width).toBeDefined();
      expect(width! > 1).toBe(line.kind === "seam");
    }
    expect(labelTexts().sort()).toEqual(plan.labels.map((label) => label.text).sort());
    expect(plan.labels.length).toBeGreaterThan(0);
  }

  describe.each([
    { scheme: "lunar-acc", text: /^[-A-Z]\d* [-A-Z]\d*$/, prefix: /^1[45]R[A-Z]{2}[A-D]{2}$/ },
    { scheme: "mgrs", text: /^\d+ \d+$/, prefix: /^1[45]R[A-Z]{2}$/ },
  ] as const)("Texas 14/15 zone seam at 96° W ($scheme)", ({ scheme, text, prefix }) => {
    it("ends each zone's lines at the seam and labels each side in its own zone", () => {
      setEarthView("mercator", 30, -96, 20, scheme);
      renderGrid();

      const plan = planForView();
      expectDrawnPlan(plan);
      expect([...plan.regions].sort()).toEqual([utm(14), utm(15)]);
      expect(plan.lines.filter((line) => line.kind === "seam")).toEqual([
        expect.objectContaining({ axis: "meridian", value: -96 }),
      ]);

      // Zone 14 lines stay west of 96° W and zone 15 lines east; both reach it.
      const seamEnds = { [utm(14)]: 0, [utm(15)]: 0 };
      for (const line of plan.lines.filter((line) => line.kind === "grid")) {
        const west = line.crs === utm(14);
        for (const lon of endLongitudes(line)) {
          expect(west ? lon <= -96 + 1e-7 : lon >= -96 - 1e-7).toBe(true);
          if (Math.abs(lon + 96) < 1e-6) seamEnds[line.crs]++;
        }
      }
      expect(seamEnds[utm(14)]).toBeGreaterThan(0);
      expect(seamEnds[utm(15)]).toBeGreaterThan(0);

      // Labels switch zone at the seam; the drawn text is the scheme's condensed form.
      for (const label of plan.labels) {
        expect(label.label!.prefix).toMatch(prefix);
        expect(label.label!.prefix.slice(0, 2)).toBe(label.crs === utm(14) ? "14" : "15");
        expect(label.text).toMatch(text);
      }
      const zones = new Set(plan.labels.map((label) => label.crs));
      expect([...zones].sort()).toEqual([utm(14), utm(15)]);
    });
  });

  it("draws the same lines in both schemes and relabels on a live scheme switch", async () => {
    setEarthView("mercator", 30, -96, 20, "lunar-acc");
    saveFixedSpacing(1000);
    renderGrid();
    const accLines = lineFeatures().map((f) => f.getGeometry()!.getFlatCoordinates());
    const accTexts = labelTexts();
    expect(accTexts.length).toBeGreaterThan(0);
    expect(accTexts.every((t) => /^[-A-Z] [-A-Z]$/.test(t))).toBe(true);

    const { flushSync } = await import("react-dom");
    flushSync(() => store.dispatch(setGridLabelSchemeOverride("mgrs")));

    expect(lineFeatures().map((f) => f.getGeometry()!.getFlatCoordinates())).toEqual(accLines);
    expect(labelTexts()).toHaveLength(accTexts.length);
    expect(labelTexts().every((t) => /^\d{2} \d{2}$/.test(t))).toBe(true);
  });

  it("runs lines continuously across the Iceland 64° N band boundary", () => {
    setEarthView("mercator", 64, -16.5, 5);
    renderGrid();

    const plan = planForView();
    expectDrawnPlan(plan);
    expect(plan.regions).toEqual([utm(28)]);
    expect(plan.lines.filter((line) => line.kind === "seam")).toEqual([
      expect.objectContaining({ axis: "parallel", value: 64 }),
    ]);

    // One unsplit line per easting, crossing the band parallel.
    const eastings = plan.lines.filter((line) => line.axis === "easting");
    expect(new Set(eastings.map((line) => line.value)).size).toBe(eastings.length);
    for (const line of eastings) {
      const lats = lineLatitudes(line);
      expect(Math.min(...lats)).toBeLessThan(64);
      expect(Math.max(...lats)).toBeGreaterThan(64);
    }

    // Only the band letter of the full prefix changes.
    const bands = new Set(plan.labels.map((label) => label.label!.prefix[2]));
    expect([...bands].sort()).toEqual(["V", "W"]);
    const otherwise = new Set(
      plan.labels.map(({ label }) => label!.prefix.slice(0, 2) + label!.prefix.slice(3))
    );
    expect(otherwise.size).toBe(1);
  });

  it("labels a band-split box by its centre while a readout in it uses its own latitude", () => {
    setEarthView("mercator", 64, -16.5, 25);
    saveFixedSpacing(1000);
    renderGrid();

    const plan = planForView({ gridSpacingMode: 1000, gridLabelInterval: 1000 });
    expectDrawnPlan(plan);
    const system = missionBinding().system;
    const latAt = (e: number, n: number): number => {
      expect(system.unprojectToLatLon(e, n, utm(28), latLon)).toBe(true);
      return latLon[0];
    };

    // A drawn 1 km box split by 64° N, and a point in it on the other side from its centre.
    let split: LgrsRenderLabel | undefined;
    let point: AEGISPoint | undefined;
    for (const label of plan.labels) {
      const [e, n] = label.node!;
      const southOfCentre = latAt(e + 500, n + 500) < 64;
      const pointN = southOfCentre ? n + 990 : n + 10;
      if (label.label!.precision !== 1000 || latAt(e + 500, pointN) < 64 === southOfCentre) {
        continue;
      }
      split = label;
      point = { lat: latAt(e + 500, pointN), lng: latLon[1] };
      break;
    }
    expect(split).toBeDefined();
    const readout = formatLgrsFromLatLon(system, point, 10, "full")!;
    const labelBand = split!.label!.prefix[2];
    expect(labelBand).toBe(point!.lat < 64 ? "W" : "V");
    expect(readout.slice(0, 3)).toBe(point!.lat < 64 ? "28V" : "28W");
    // Same 25 km area and same 1 km box; only the band letter differs.
    expect(readout.slice(3).startsWith(split!.label!.prefix.slice(3))).toBe(true);
    const [, easting, northing] = readout.split(" ");
    expect(`${easting[0]} ${northing[0]}`).toBe(split!.text);
  });

  it("draws UPS and UTM grids that meet at the 84° N seam", () => {
    setEarthView("upsNorth", 84, 1, 25);
    renderGrid();

    const plan = planForView();
    expectDrawnPlan(plan);
    expect([...plan.regions].sort((a, b) => a - b)).toEqual([EARTH_CRS_UPS_NORTH, utm(31)]);
    expect(plan.lines.filter((line) => line.kind === "seam")).toEqual([
      expect.objectContaining({ axis: "parallel", value: 84 }),
    ]);

    // UPS lines stay north of 84° N and UTM lines south of it.
    for (const line of plan.lines.filter((line) => line.kind === "grid")) {
      const lats = lineLatitudes(line);
      if (line.crs === EARTH_CRS_UPS_NORTH) {
        expect(Math.min(...lats)).toBeGreaterThan(84 - 1e-6);
      } else {
        expect(Math.max(...lats)).toBeLessThan(84 + 1e-6);
      }
    }
    for (const label of plan.labels) {
      expect(label.label!.prefix).toMatch(label.crs === EARTH_CRS_UPS_NORTH ? /^Z/ : /^31X/);
    }
    expect(new Set(plan.labels.map((label) => label.crs)).size).toBe(2);
  });

  it("dashboard publishes its spacing under the system key", async () => {
    setEarthView("mercator", 29.5593, -95.09, 10, "mgrs");
    renderGridInBounds("dashboard");
    await flushPublish();

    const plan = planForView();
    expect(bounds.ctx!.gridSpacing).toEqual({
      line: plan.lineSpacing,
      label: plan.labelSpacing,
      systemKey: "earth-wgs84/mgrs",
    });
  });

  it("minimap ignores a spacing published under another system key", async () => {
    setEarthView("mercator", 29.5593, -95.09, 10);
    renderGridInBounds("minimap");
    const own = planForView({ labelsVisible: false });
    const inherited = planForView({
      labelsVisible: false,
      inheritedSpacing: { line: 1000, label: 1000 },
    });
    expect(inherited.lines.length).toBeLessThan(own.lines.length);
    expect(lineFeatureCount()).toBe(own.lines.length);

    const { flushSync } = await import("react-dom");
    flushSync(() =>
      bounds.ctx!.setGridSpacing({ line: 1000, label: 1000, systemKey: "earth-wgs84/mgrs" })
    );
    renderGridInBounds("minimap");
    expect(lineFeatureCount()).toBe(own.lines.length);

    flushSync(() =>
      bounds.ctx!.setGridSpacing({ line: 1000, label: 1000, systemKey: "earth-wgs84/lunar-acc" })
    );
    renderGridInBounds("minimap");
    expect(lineFeatureCount()).toBe(inherited.lines.length);
  });
});
