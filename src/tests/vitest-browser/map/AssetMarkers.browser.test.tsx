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
import type { Polygon } from "ol/geom";
import type Style from "ol/style/Style";
import { CookiesProvider, Cookies } from "react-cookie";

import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { MapMenuPanel } from "components/interface/map/overlays/map-menu";
import { AssetMarkers } from "components/interface/map/behaviors/AssetMarkers";
import { AssetUncertainty } from "components/interface/map/behaviors/AssetUncertainty";
import { MarkerLabels } from "components/interface/map/behaviors/MarkerLabels";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { assetSlice, setAssetInEdit, setSelectedAssetUuid } from "store/asset";
import { actionSlice } from "store/action";
import { connectionSlice } from "store/connection";
import { evaSlice } from "store/eva";
import { hoverSlice } from "store/hover";
import { interfaceSlice } from "store/interface";
import { mapSlice, updateMapDirective } from "store/map";
import { measureSlice } from "store/measure";
import { missionSlice } from "store/mission";
import { poiSlice } from "store/poi";
import { rexSlice } from "store/rex";
import { stationSlice } from "store/station";
import { traverseSlice } from "store/traverse";
import { userSlice } from "store/user";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankPoi } from "store/storeUtils/poi";
import { getAssetEditValues } from "utils/assets";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

vi.mock("store/thunk/thunkMap", () => ({
  cancelPendingMapDirective: (): void => undefined,
  thunkUpdateMapDirective: (args: unknown) => ({
    type: "mock/thunkUpdateMapDirective",
    payload: args,
  }),
  thunkMarkerOnClick: (args: unknown) => ({ type: "mock/thunkMarkerOnClick", payload: args }),
}));

const mockMissionDoc: Partial<Mission> = {};
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

const placed = (overrides: Partial<Asset> = {}) =>
  generateBlankAsset({
    name: "Drill",
    location: { lat: 0.01, lng: 0.02 },
    ...overrides,
  });

const connectedState = {
  ...connectionSlice.getInitialState(),
  socketStatus: {
    ...connectionSlice.getInitialState().socketStatus,
    connectionStatus: "connected" as ConnectionStatus,
  },
  automergeConnectionStatus: "connected" as ConnectionStatus,
};

function makeStore() {
  return configureStore({
    reducer: {
      asset: assetSlice.reducer,
      action: actionSlice.reducer,
      connection: connectionSlice.reducer,
      eva: evaSlice.reducer,
      hover: hoverSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      measure: measureSlice.reducer,
      mission: missionSlice.reducer,
      poi: poiSlice.reducer,
      rex: rexSlice.reducer,
      station: stationSlice.reducer,
      traverse: traverseSlice.reducer,
      user: userSlice.reducer,
    },
    preloadedState: {
      connection: connectedState,
      mission: { ...missionSlice.getInitialState(), isInEditMode: true },
      user: {
        ...userSlice.getInitialState(),
        missionPerms: { missionId: 1, permissions: { view: true, edit: true } } as Permission,
      },
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

function render(mode: MapMode = "editor", showMenu = false) {
  harness.render(
    <CookiesProvider cookies={new Cookies()}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <Capture />
            <MapContext.Provider value={{ map, mode }}>
              <AssetUncertainty />
              <AssetMarkers />
              {showMenu && <MapMenuPanel />}
              {mode !== "minimap" && <MarkerLabels />}
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

const radiusLayer = () =>
  map
    .getLayers()
    .getArray()
    .find((l) => l.getZIndex() === Z_INDEX.CIRCLES) as VectorLayer<VectorSource>;
const radiusCircles = () => radiusLayer().getSource().getFeatures();
const radiusStyle = (feature: ReturnType<typeof radiusCircles>[number]) =>
  radiusLayer().getStyleFunction()!(feature, 1) as Style;
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
    expect(radiusCircles()).toHaveLength(0);
    expect(assetLabels()).toHaveLength(0);
  });

  it("fills a radius circle in the asset color with no stroke, and none for zero radius", () => {
    const withRadius = placed({ uncertaintyMeters: 12, color: "#ff0000" });
    const withoutRadius = placed({
      uncertaintyMeters: 0,
      color: "#00ff00",
      location: { lat: 0.02, lng: 0.02 },
    });
    mockMissionDoc.assets = { [withRadius.uuid]: withRadius, [withoutRadius.uuid]: withoutRadius };
    render();
    const circles = radiusCircles();
    expect(circles).toHaveLength(1);
    const circle = circles[0];
    expect(circle.getId()).toBeUndefined();
    const coordinates = (circle.getGeometry() as Polygon).getCoordinates()[0];
    expect(coordinates[0][0]).toBeCloseTo(32);
    expect(coordinates[0][1]).toBeCloseTo(10);
    const style = radiusStyle(circle);
    expect(style.getFill()!.getColor()).toBe("rgba(255,0,0,0.3)");
    expect(style.getStroke()).toBeNull();
    expect(assetSource!.getFeatureById(withRadius.uuid).get("hasRadius")).toBe(true);
    expect(assetSource!.getFeatureById(withoutRadius.uuid).get("hasRadius")).toBe(false);
  });

  it.each(["editor", "dashboard"] as const)(
    "keeps an uncolored asset's radius fill transparent on the %s map",
    (mode) => {
      const asset = placed({ uncertaintyMeters: 12, color: null });
      mockMissionDoc.assets = { [asset.uuid]: asset };
      render(mode);
      expect(radiusStyle(radiusCircles()[0]).getFill()!.getColor()).toBe("transparent");
      expect(radiusStyle(radiusCircles()[0]).getStroke()).toBeNull();
    }
  );

  it("strokes the selected asset's radius circle while keeping its fill transparent", () => {
    const asset = placed({ uncertaintyMeters: 12 });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render();
    expect(radiusStyle(radiusCircles()[0]).getStroke()).toBeNull();
    flushSync(() => store.dispatch(setSelectedAssetUuid(asset.uuid)));
    expect(radiusStyle(radiusCircles()[0]).getFill()!.getColor()).toBe("transparent");
    expect(radiusStyle(radiusCircles()[0]).getStroke()!.getColor()).toBe("#ffffff");
  });

  it("labels assets separately from the Assets toggle and dims them below other labels", () => {
    const asset = placed({ name: "Core Tube" });
    const poi = generateBlankPoi({ name: "Crater Rim", location: asset.location! });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    mockMissionDoc.pois = { [poi.uuid]: poi };
    render();
    flushSync(() => setters!.setSubmenuPois({ show: true, showLabels: true }));
    expect(assetLabels().map((f) => f.get("name"))).toEqual(["Core Tube"]);
    expect(labelSource!.getFeatureById(`poi-${poi.uuid}`)!.get("labelOpacity")).toBe(1);
    expect(labelSource!.getFeatureById(`asset-${asset.uuid}`)!.get("labelOpacity")).toBeLessThan(1);

    flushSync(() => setters!.setSubmenuAssets({ show: true, showLabels: false }));
    expect(assetLabels()).toHaveLength(0);
    expect(assetSource!.getFeatures()).toHaveLength(1);
  });

  it("previews the editor inEdit under the saved asset's feature id", () => {
    const asset = placed({ name: "Drill" });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render();
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: asset.uuid,
          isNew: false,
          values: {
            ...getAssetEditValues(asset),
            location: { lat: 0.05, lng: 0.06 },
            name: "Moved",
          },
          base: getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
    expect(assetSource!.getFeatures()).toHaveLength(1);
    const feature = assetSource!.getFeatureById(asset.uuid);
    expect(feature.getGeometry().getExtent().slice(0, 2)).toEqual([60, 50]);
    expect(assetLabels().map((f) => f.get("name"))).toEqual(["Moved"]);
  });

  it("stays inert on the minimap — mode config asset.show is false", () => {
    const asset = placed();
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render("minimap");
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: asset.uuid,
          isNew: false,
          values: { ...getAssetEditValues(asset), location: { lat: 0.05, lng: 0.06 } },
          base: getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
    expect(
      map
        .getLayers()
        .getArray()
        .some((l) => l.getZIndex() === Z_INDEX.ASSETS)
    ).toBe(false);
    expect(
      map
        .getLayers()
        .getArray()
        .some((l) => l.getZIndex() === Z_INDEX.CIRCLES)
    ).toBe(false);
    expect(assetSource!.getFeatures()).toHaveLength(0);
  });

  it("does not show the editor inEdit on the dashboard", () => {
    const asset = placed();
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render("dashboard");
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: asset.uuid,
          isNew: false,
          values: { ...getAssetEditValues(asset), location: { lat: 0.05, lng: 0.06 } },
          base: getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
    expect(assetSource!.getFeatures()).toHaveLength(1);
    expect(assetSource!.getFeatureById(asset.uuid).getGeometry().getExtent().slice(0, 2)).toEqual([
      20, 10,
    ]);
  });

  it("shows only the selected hidden asset and hides it again after deselection", () => {
    const asset = placed({ visible: false, uncertaintyMeters: 20 });
    const other = placed();
    const folder = generateBlankFolder({ type: "asset", visible: false, items: [asset.uuid] });
    mockMissionDoc.assets = { [asset.uuid]: asset, [other.uuid]: other };
    mockMissionDoc.folders = { [folder.uuid]: folder };
    render();
    flushSync(() => setters!.setSubmenuAssets({ show: false, showLabels: false }));
    expect(assetSource!.getFeatures()).toHaveLength(0);
    flushSync(() => store.dispatch(setSelectedAssetUuid(asset.uuid)));
    expect(assetSource!.getFeatures().map((f) => f.getId())).toEqual([asset.uuid]);
    expect(radiusCircles()).toHaveLength(1);
    expect(assetLabels()).toHaveLength(0);
    flushSync(() => store.dispatch(setSelectedAssetUuid(null)));
    expect(assetSource!.getFeatures()).toHaveLength(0);
    expect(radiusCircles()).toHaveLength(0);
    expect(asset.visible).toBe(false);
    expect(folder.visible).toBe(false);
  });

  it("previews a newly placed draft with markers and labels hidden, then removes it on cancel", () => {
    const other = placed();
    mockMissionDoc.assets = { [other.uuid]: other };
    const draft = placed({ uncertaintyMeters: 10 });
    render();
    flushSync(() => setters!.setSubmenuAssets({ show: false, showLabels: false }));
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: draft.uuid,
          isNew: true,
          base: null,
          values: getAssetEditValues(draft),
          elevationPending: false,
        })
      )
    );
    expect(assetSource!.getFeatures().map((f) => f.getId())).toEqual([draft.uuid]);
    expect(radiusCircles()).toHaveLength(1);
    expect(assetLabels()).toHaveLength(0);
    flushSync(() => store.dispatch(assetSlice.actions.clearAssetInEdit()));
    expect(assetSource!.getFeatures()).toHaveLength(0);
    expect(radiusCircles()).toHaveLength(0);
  });

  it("hiding Assets in the visibility menu cancels positioning and keeps the draft", () => {
    const asset = placed({ name: "Drill" });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    render("editor", true);

    const startEditAndMapDirective = () => {
      flushSync(() => {
        store.dispatch(
          setAssetInEdit({
            uuid: asset.uuid,
            isNew: false,
            values: {
              ...getAssetEditValues(asset),
              location: { lat: 0.05, lng: 0.06 },
              name: "Moved",
            },
            base: getAssetEditValues(asset),
            elevationPending: false,
          })
        );
        store.dispatch(
          updateMapDirective({
            mapItemType: "asset",
            uuid: asset.uuid,
            mapAction: "editMarker",
          })
        );
      });
      expect(store.getState().map.mapDirective?.mapItemType).toBe("asset");
    };

    startEditAndMapDirective();
    const toggle = harness.container.querySelector<HTMLElement>(
      "[data-testid='map-menu-assets-toggle']"
    )!;
    flushSync(() => toggle.click());
    expect(store.getState().map.mapDirective).toBeNull();
    expect(store.getState().asset.inEdit?.values.name).toBe("Moved");
    expect(assetSource!.getFeatures()).toHaveLength(1);

    flushSync(() => toggle.click());
    expect(store.getState().map.mapDirective).toBeNull();
    expect(assetSource!.getFeatureById(asset.uuid).getGeometry().getExtent().slice(0, 2)).toEqual([
      60, 50,
    ]);
  });
});
