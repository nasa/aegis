/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for the asset map behaviors: `AssetMarkers`, `AssetUncertainty`, and the
 * asset labels drawn by `MarkerLabels`.
 *
 * Mounts the headless behaviors against a hand-rolled OL Map, a Redux store, and real
 * FeatureSourcesProvider / MapMenuProvider contexts. The mission doc is a mutable mock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import { flushSync } from "react-dom";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { LineString } from "ol/geom";
import { CookiesProvider, Cookies } from "react-cookie";

import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { AssetMarkers } from "components/interface/map/behaviors/AssetMarkers";
import { AssetUncertainty } from "components/interface/map/behaviors/AssetUncertainty";
import { MarkerLabels } from "components/interface/map/behaviors/MarkerLabels";
import { createCircleLayer } from "components/interface/map/utils/layers/circleLayer";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { assetSlice, openAssetDraft } from "store/asset";
import { actionSlice } from "store/action";
import { evaSlice } from "store/eva";
import { hoverSlice } from "store/hover";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { measureSlice } from "store/measure";
import { poiSlice } from "store/poi";
import { rexSlice } from "store/rex";
import { stationSlice } from "store/station";
import { traverseSlice } from "store/traverse";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { getAssetDraftValues } from "utils/assets";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

vi.mock("store/thunk/thunkMap", () => ({
  thunkMarkerOnClick: (args: unknown) => ({ type: "mock/thunkMarkerOnClick", payload: args }),
}));

const mockMissionDoc: Partial<Mission> = {};
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

const placement: AssetPlacementContext = {
  locationSetAt: 1,
  runningRexUuid: null,
  runningRexName: null,
  runningEvaUuid: null,
  runningEvaName: null,
  petClock: null,
};
const placed = (overrides: Partial<Asset> = {}) =>
  generateBlankAsset({
    name: "Drill",
    location: { lat: 0.01, lng: 0.02 },
    placement,
    ...overrides,
  });

function makeStore() {
  return configureStore({
    reducer: {
      asset: assetSlice.reducer,
      action: actionSlice.reducer,
      eva: evaSlice.reducer,
      hover: hoverSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      measure: measureSlice.reducer,
      poi: poiSlice.reducer,
      rex: rexSlice.reducer,
      station: stationSlice.reducer,
      traverse: traverseSlice.reducer,
    },
  });
}

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;
let assetSource: VectorSource | null = null;
let labelSource: VectorSource | null = null;
let setters: ReturnType<typeof useMapMenuSetters> | null = null;

function Capture(): null {
  ({ assetSource, labelSource } = useFeatureSourcesContext());
  setters = useMapMenuSetters();
  return null;
}

function render(mode: MapMode = "editor") {
  harness.render(
    <CookiesProvider cookies={new Cookies()}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <Capture />
            <MapContext.Provider value={{ map, mode }}>
              <AssetUncertainty />
              <AssetMarkers />
              {mode !== "minimap" && <MarkerLabels />}
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

const ringLayers = () =>
  map
    .getLayers()
    .getArray()
    .filter((l) => l.getZIndex() === Z_INDEX.CIRCLES) as VectorLayer<VectorSource>[];
const assetLabels = () =>
  (labelSource?.getFeatures() ?? []).filter((f) => f.get("labelType") === "asset");

beforeEach(() => {
  harness = createReactHarness();
  for (const key of Object.keys(mockMissionDoc))
    delete (mockMissionDoc as Record<string, unknown>)[key];
  mockMissionDoc.assets = {};
  mockMissionDoc.folders = {};
  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);
  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });
  store = makeStore();
});

afterEach(() => {
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

describe("asset map behaviors", () => {
  it("draws placed assets at ASSETS z-index and never draws unplaced assets", () => {
    const shown = placed({ icon: null });
    const unplaced = generateBlankAsset({ name: "Box" });
    mockMissionDoc.assets = { [shown.uuid]: shown, [unplaced.uuid]: unplaced };
    render();
    const layer = map
      .getLayers()
      .getArray()
      .find((l) => l.getZIndex() === Z_INDEX.ASSETS);
    expect(layer).toBeDefined();
    expect(assetSource!.getFeatures().map((f) => f.getId())).toEqual([shown.uuid]);
    expect(assetSource!.getFeatureById(shown.uuid).get("emoji")).toBe("2754");
    // Nothing sits at the projection origin.
    expect(assetSource!.getFeatures().some((f) => f.getGeometry().getExtent()[0] === 0)).toBe(
      false
    );
  });

  it("hides assets by the shared item and folder flags and by the viewer's Assets toggle", () => {
    const own = placed({ visible: false });
    const inFolder = placed();
    const root = placed();
    const folder = generateBlankFolder({ type: "asset", visible: false, items: [inFolder.uuid] });
    mockMissionDoc.assets = { [own.uuid]: own, [inFolder.uuid]: inFolder, [root.uuid]: root };
    mockMissionDoc.folders = { [folder.uuid]: folder };
    render();
    expect(assetSource!.getFeatures().map((f) => f.getId())).toEqual([root.uuid]);
    flushSync(() => setters!.setSubmenuAssets({ show: false, showLabels: true }));
    expect(assetSource!.getFeatures()).toHaveLength(0);
    expect(ringLayers()).toHaveLength(0);
    expect(assetLabels()).toHaveLength(0);
  });

  it("draws a ring matching a proximity circle of the same radius, and none for zero", () => {
    const ringed = placed({ uncertaintyMeters: 12 });
    const unringed = placed({ uncertaintyMeters: 0, location: { lat: 0.02, lng: 0.02 } });
    mockMissionDoc.assets = { [ringed.uuid]: ringed, [unringed.uuid]: unringed };
    render();
    const rings = ringLayers();
    expect(rings).toHaveLength(1);
    const ring = rings[0].getSource().getFeatures()[0];
    expect(ring.getId()).toBeUndefined();
    const reference = createCircleLayer([20, 10], 12).getSource().getFeatures()[0];
    expect((ring.getGeometry() as LineString).getCoordinates()).toEqual(
      (reference.getGeometry() as LineString).getCoordinates()
    );
  });

  it("labels assets separately from the Assets toggle and dims them below other labels", () => {
    const asset = placed({ name: "Core Tube" });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render();
    expect(assetLabels().map((f) => f.get("name"))).toEqual(["Core Tube"]);
    flushSync(() => setters!.setSubmenuAssets({ show: true, showLabels: false }));
    expect(assetLabels()).toHaveLength(0);
    expect(assetSource!.getFeatures()).toHaveLength(1);
  });

  it("previews the editor draft under the saved asset's feature id", () => {
    const asset = placed({ name: "Drill" });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render();
    flushSync(() =>
      store.dispatch(
        openAssetDraft({
          uuid: asset.uuid,
          isNew: false,
          missionId: null,
          values: {
            ...getAssetDraftValues(asset),
            location: { lat: 0.05, lng: 0.06 },
            name: "Moved",
          },
          base: getAssetDraftValues(asset),
          elevationPending: false,
          message: null,
        })
      )
    );
    expect(assetSource!.getFeatures()).toHaveLength(1);
    const feature = assetSource!.getFeatureById(asset.uuid);
    expect(feature.getGeometry().getExtent().slice(0, 2)).toEqual([60, 50]);
    expect(assetLabels().map((f) => f.get("name"))).toEqual(["Moved"]);
  });

  it("does not show the editor draft on the minimap", () => {
    const asset = placed();
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render("minimap");
    flushSync(() =>
      store.dispatch(
        openAssetDraft({
          uuid: asset.uuid,
          isNew: false,
          missionId: null,
          values: { ...getAssetDraftValues(asset), location: { lat: 0.05, lng: 0.06 } },
          base: getAssetDraftValues(asset),
          elevationPending: false,
          message: null,
        })
      )
    );
    expect(assetSource!.getFeatureById(asset.uuid).getGeometry().getExtent().slice(0, 2)).toEqual([
      20, 10,
    ]);
  });
});
