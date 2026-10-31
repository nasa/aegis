/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `MapAssetsMenu` (the Assets tab of the floating Rex Menu widget):
 * permission gating, the folder-aware table, and the asset editor's map-placement controls.
 * Asset thunks are stubbed; the mission doc is a mutable mock.
 */

import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { flushSync } from "react-dom";
import { CookiesProvider, Cookies } from "react-cookie";

import { MapAssetsMenu } from "components/interface/map/overlays/map-menu-assets";
import { MapMenuProvider, useMapMenuContext } from "components/interface/map/MapMenuProvider";
import { assetSlice, openAssetDraft } from "store/asset";
import { connectionSlice } from "store/connection";
import { hoverSlice } from "store/hover";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { missionSlice } from "store/mission";
import { userSlice } from "store/user";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { getAssetDraftValues } from "utils/assets";
import { createReactHarness, type ReactHarness } from "../map/helpers/reactBrowserHarness";

const mockMissionDoc: Partial<Mission> = {};
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

const startGesture = vi.fn(() => ({ type: "mock/startGesture" }));
const openNewDraft = vi.fn(() => ({ type: "mock/openNewDraft" }));
vi.mock("store/thunk/thunkAsset", () => ({
  thunkStartAssetGesture: () => startGesture(),
  thunkOpenNewAssetDraft: () => openNewDraft(),
  thunkCancelAssetGesture: () => ({ type: "mock/cancelGesture" }),
  thunkCancelAssetDraft: () => ({ type: "mock/cancelDraft" }),
  thunkSaveAssetDraft: () => ({ type: "mock/save" }),
  thunkSetAssetDraftLocation: () => ({ type: "mock/setLocation" }),
  thunkOpenAssetDraftForEdit: () => ({ type: "mock/openEdit" }),
  thunkDeleteAsset: () => ({ type: "mock/delete" }),
  thunkMoveAssetToFolder: () => ({ type: "mock/move" }),
  thunkToggleAssetVisible: () => ({ type: "mock/toggleVisible" }),
}));

const connectedState = {
  ...connectionSlice.getInitialState(),
  socketStatus: {
    ...connectionSlice.getInitialState().socketStatus,
    connectionStatus: "connected" as ConnectionStatus,
  },
  automergeConnectionStatus: "connected" as ConnectionStatus,
};

function makeStore(canEdit: boolean, isInEditMode = true) {
  return configureStore({
    reducer: {
      asset: assetSlice.reducer,
      connection: connectionSlice.reducer,
      hover: hoverSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      mission: missionSlice.reducer,
      user: userSlice.reducer,
    },
    preloadedState: {
      connection: connectedState,
      mission: { ...missionSlice.getInitialState(), isInEditMode },
      user: {
        ...userSlice.getInitialState(),
        missionPerms: { missionId: 1, permissions: { view: true, edit: canEdit } } as Permission,
      },
    },
  });
}

let harness: ReactHarness;
let store: ReturnType<typeof makeStore>;
let menuSettings: ReturnType<typeof useMapMenuContext> | null = null;

function CaptureMenu(): null {
  menuSettings = useMapMenuContext();
  return null;
}

function render() {
  harness.render(
    <CookiesProvider cookies={new Cookies()}>
      <Provider store={store}>
        <MapMenuProvider>
          <CaptureMenu />
          <MapAssetsMenu />
        </MapMenuProvider>
      </Provider>
    </CookiesProvider>
  );
}

const q = (selector: string) => harness.container.querySelector<HTMLElement>(selector);
const byText = (text: string) =>
  [...harness.container.querySelectorAll<HTMLElement>("div, button, span")].find(
    (el) => el.textContent?.trim() === text && el.children.length === 0
  );

beforeEach(() => {
  vi.clearAllMocks();
  harness = createReactHarness();
  for (const key of Object.keys(mockMissionDoc))
    delete (mockMissionDoc as Record<string, unknown>)[key];
  mockMissionDoc.assets = {};
  mockMissionDoc.folders = {};
  mockMissionDoc.usingLGRSCoordinates = false;
});

afterEach(() => harness.unmount());

describe("MapAssetsMenu", () => {
  it("lets an editor add assets with the global Edit toggle on", () => {
    store = makeStore(true);
    render();
    expect(q("[data-testid='asset-table-empty']")?.textContent).toBe(
      "No assets added yet. Click Add Asset to add one."
    );
    byText("Add Asset")!.click();
    expect(openNewDraft).toHaveBeenCalledTimes(1);
  });

  it("is read-only without edit permission", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    store = makeStore(false);
    render();
    expect(byText("Add Asset")).toBeUndefined();
    expect(q(`[aria-label='Asset actions']`)).toBeNull();
    expect(q(`[data-testid='asset-visibility-${asset.uuid}']`)).toBeNull();
  });

  it("is read-only with the global Edit toggle off", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset", name: "Cache", items: [asset.uuid] });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    mockMissionDoc.folders = { [folder.uuid]: folder };
    store = makeStore(true, false);
    render();
    expect(byText("Add Asset")).toBeUndefined();
    expect(byText("Add Folder")).toBeUndefined();
    expect(q(`[aria-label='Asset actions']`)).toBeNull();
    expect(q(`[aria-label='Folder actions']`)).toBeNull();
    expect(q(`[data-testid='asset-visibility-${asset.uuid}']`)).toBeNull();
    expect(q(`[data-testid='asset-folder-visibility-${folder.uuid}']`)).toBeNull();
  });

  it("lists folders alphabetically first, then root assets alphabetically, in aligned rows", () => {
    const zed = generateBlankAsset({ name: "zed" });
    const alpha = generateBlankAsset({ name: "Alpha" });
    const inFolder = generateBlankAsset({ name: "Tube" });
    const zebra = generateBlankFolder({ type: "asset", name: "Zebra", createdAt: 1 });
    const alphaFolder = generateBlankFolder({
      type: "asset",
      name: "Alpha",
      createdAt: 2,
      items: [inFolder.uuid],
    });
    const poiFolder = generateBlankFolder({ type: "poi", name: "POIs" });
    mockMissionDoc.assets = { [zed.uuid]: zed, [alpha.uuid]: alpha, [inFolder.uuid]: inFolder };
    mockMissionDoc.folders = {
      [zebra.uuid]: zebra,
      [alphaFolder.uuid]: alphaFolder,
      [poiFolder.uuid]: poiFolder,
    };
    store = makeStore(true);
    render();

    const bodies = [...harness.container.querySelectorAll("tbody")];
    expect(bodies.map((b) => b.getAttribute("data-testid"))).toEqual([
      `asset-folder-${alphaFolder.uuid}`,
      `asset-folder-${zebra.uuid}`,
      null,
    ]);
    const rowIds = [...harness.container.querySelectorAll("tr[data-testid^='asset-row-']")].map(
      (r) => r.getAttribute("data-testid")
    );
    expect(rowIds).toEqual([inFolder, alpha, zed].map((a) => `asset-row-${a.uuid}`));

    const headerCells = harness.container.querySelectorAll("thead th").length;
    expect(harness.container.querySelectorAll("col").length).toBe(headerCells);
    for (const row of harness.container.querySelectorAll("tr[data-testid^='asset-row-']")) {
      expect(row.querySelectorAll("td").length).toBe(headerCells);
    }
    for (const row of harness.container.querySelectorAll("tbody tr")) {
      const spans = [...row.querySelectorAll("td")].map(
        (td) => (td as HTMLTableCellElement).colSpan
      );
      expect(spans.reduce((sum, span) => sum + span, 0)).toBe(headerCells);
    }
    expect(q(`[data-testid='asset-row-${zed.uuid}']`)?.textContent).toContain("Not placed");
  });

  it("draws the emoji disc in the radius color only for a positive radius", () => {
    const ringed = generateBlankAsset({ name: "Ringed", color: "#ff0000", uncertaintyMeters: 5 });
    const flat = generateBlankAsset({ name: "Flat", color: "#ff0000", uncertaintyMeters: 0 });
    mockMissionDoc.assets = { [ringed.uuid]: ringed, [flat.uuid]: flat };
    store = makeStore(true);
    render();
    const emojiCell = (uuid: string) =>
      q(`[data-testid='asset-row-${uuid}']`)!.querySelectorAll("td")[2] as HTMLElement;
    expect(emojiCell(ringed.uuid).style.backgroundColor).toBe("rgba(255, 0, 0, 0.5)");
    expect(emojiCell(flat.uuid).style.backgroundColor).toBe("");
  });

  it("turns the viewer's Assets and Asset Labels back on when placing starts", () => {
    store = makeStore(true);
    render();
    flushSync(() =>
      store.dispatch(
        openAssetDraft({
          uuid: "new-asset",
          isNew: true,
          missionId: null,
          values: getAssetDraftValues(generateBlankAsset()),
          base: null,
          elevationPending: false,
          message: null,
        })
      )
    );
    expect(q("[data-testid='asset-editor']")?.textContent).toContain("Add Asset");
    expect(byText("Place on Map")).toBeDefined();
    // The editor has no folder field.
    expect(q("[data-testid='asset-editor'] select")).toBeNull();

    flushSync(() => byText("Place on Map")!.click());
    expect(menuSettings!.submenuAssets).toEqual({ show: true, showLabels: true });
    expect(startGesture).toHaveBeenCalledTimes(1);
  });

  it("disables Edit Pos. for an asset hidden by its folder, naming the folder", () => {
    const asset = generateBlankAsset({
      name: "Drill",
      location: { lat: 1, lng: 1 },
      placement: {
        locationSetAt: 1,
        runningRexUuid: null,
        runningRexName: null,
        runningEvaUuid: null,
        runningEvaName: null,
        petClock: null,
      },
    });
    const folder = generateBlankFolder({
      type: "asset",
      name: "Cache",
      visible: false,
      items: [asset.uuid],
    });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    mockMissionDoc.folders = { [folder.uuid]: folder };
    store = makeStore(true);
    render();
    flushSync(() =>
      store.dispatch(
        openAssetDraft({
          uuid: asset.uuid,
          isNew: false,
          missionId: null,
          values: getAssetDraftValues(asset),
          base: getAssetDraftValues(asset),
          elevationPending: false,
          message: null,
        })
      )
    );
    const editPos = byText("Edit Pos.")!.parentElement!;
    expect(editPos.getAttribute("data-tooltip-content")).toContain('"Cache"');
    flushSync(() => editPos.click());
    expect(startGesture).not.toHaveBeenCalled();
    expect(q("[data-testid='asset-editor-coordinates']")?.hasAttribute("disabled")).toBe(false);
  });
});
