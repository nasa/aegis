/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `MapAssetsMenu` (the Assets tab of the floating Rex Menu widget):
 * permission gating, the folder-aware table, and the asset editor's map-placement controls.
 * Asset thunks are stubbed; the mission doc is a mutable mock.
 */

import { configureStore } from "@reduxjs/toolkit";
import { userEvent } from "vitest/browser";
import { Provider } from "react-redux";
import { flushSync } from "react-dom";
import { CookiesProvider, Cookies } from "react-cookie";
import "styles/globals.css";
import "styles/fonts.css";

import { MapAssetsMenu } from "components/interface/map/overlays/map-menu-assets";
import { MapMenuProvider, useMapMenuContext } from "components/interface/map/MapMenuProvider";
import { assetSlice, setAssetInEdit } from "store/asset";
import { connectionSlice } from "store/connection";
import { hoverSlice } from "store/hover";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { missionSlice } from "store/mission";
import { userSlice } from "store/user";
import { generateBlankAsset } from "store/storeUtils/asset";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankRex } from "store/storeUtils/rex";
import {
  ASSET_NAME_MAX_LENGTH,
  ASSET_NOTES_MAX_LENGTH,
  ASSET_RADIUS_MAX_METERS,
  getAssetEditValues,
} from "utils/assets";
import { createReactHarness, type ReactHarness } from "../map/helpers/reactBrowserHarness";

const mockMissionDoc: Partial<Mission> = {};
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

const startMapDirective = vi.fn(() => ({ type: "mock/startMapDirective" }));
const addAsset = vi.fn(() => ({ type: "mock/addAsset" }));
const editAsset = vi.fn((args: { assetUuid: string }) => ({
  type: "mock/openEdit",
  payload: args,
}));
const deleteAsset = vi.fn((args: { assetUuid: string }) => ({
  type: "mock/delete",
  payload: args,
}));
const cancelEdit = vi.fn(() => assetSlice.actions.clearAssetInEdit({ keepExpanded: true }));
const setLocation = vi.fn(
  (_args: { uuid: string; location: AEGISPoint | null; saveImmediately?: boolean }) => ({
    type: "mock/setLocation",
  })
);
const updateFields = vi.fn(
  (_args: {
    assetUuid: string;
    changes?: Partial<AssetEditValues>;
    petUpdate?: "current" | "clear";
  }) => undefined
);
const saveAsset = vi.fn((_options?: { petUpdate?: "current" | "clear" }) => ({
  type: "mock/save",
}));
vi.mock("store/thunk/thunkAsset", () => ({
  thunkStartAssetMapDirective: () => startMapDirective(),
  thunkAddAsset: () => addAsset(),
  thunkCancelAssetMapDirective: () => ({ type: "mock/cancelMapDirective" }),
  thunkCancelAssetEdit: () => cancelEdit(),
  thunkSaveAssetEdit: (options?: { petUpdate?: "current" | "clear" }) => saveAsset(options),
  thunkSetAssetEditLocation: (args: Parameters<typeof setLocation>[0]) => setLocation(args),
  thunkEditAsset: (args: { assetUuid: string }) => editAsset(args),
  thunkDeleteAsset: (args: { assetUuid: string }) => deleteAsset(args),
  thunkMoveAssetToFolder: () => ({ type: "mock/move" }),
  thunkToggleAssetVisible: () => ({ type: "mock/toggleVisible" }),
  thunkUpdateAssetFields: (args: Parameters<typeof updateFields>[0]) => () => {
    updateFields(args);
    return { unwrap: () => Promise.resolve(true) };
  },
}));

const connectedState = {
  ...connectionSlice.getInitialState(),
  socketStatus: {
    ...connectionSlice.getInitialState().socketStatus,
    connectionStatus: "connected" as ConnectionStatus,
  },
  automergeConnectionStatus: "connected" as ConnectionStatus,
};

function makeStore(canEdit: boolean, isInEditMode = false) {
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
const dialogAction = (label: string) =>
  [...q("dialog[open]")!.querySelectorAll<HTMLElement>("div")].find(
    (el) => el.textContent === label && el.children.length === 0
  )!;
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
  function openDraft(asset: Asset, isNew: boolean) {
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: asset.uuid,
          isNew,
          values: getAssetEditValues(asset),
          base: isNew ? null : getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
  }

  function enterValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    flushSync(() => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it.each([320, 420, 600])(
    "wraps long asset content and preserves table actions at %ipx",
    async (width) => {
      harness.container.style.width = `${width}px`;
      harness.container.style.height = "360px";
      const notes = `First line\n\n${"LongUnbrokenWord".repeat(500)}\n${"中文 😀 ".repeat(200)}\nLast line`;
      const asset = generateBlankAsset({
        name: "N".repeat(ASSET_NAME_MAX_LENGTH),
        notes,
        petRex: { uuid: "rex", name: "REX".repeat(150) },
      });
      const folder = generateBlankFolder({
        type: "asset",
        name: "Folder".repeat(100),
        items: [asset.uuid],
      });
      mockMissionDoc.assets = { [asset.uuid]: asset };
      mockMissionDoc.folders = { [folder.uuid]: folder };
      store = makeStore(true);
      render();
      flushSync(() => q(`[data-testid='asset-expand-${asset.uuid}']`)!.click());
      await document.fonts.ready;
      for (const editing of [false, true]) {
        if (editing) openDraft(asset, false);
        const editor = q("[data-testid='asset-editor']")!;
        const notesDisplay = q("div[aria-label='Asset notes']")!;
        const menu = q("[data-testid='asset-table']")!.parentElement!;
        expect(notesDisplay.textContent).toBe(notes);
        expect(notesDisplay.scrollWidth).toBeLessThanOrEqual(notesDisplay.clientWidth + 1);
        expect(notesDisplay.scrollHeight).toBeGreaterThan(notesDisplay.clientHeight);
        expect(getComputedStyle(notesDisplay).whiteSpace).toBe("pre-wrap");
        expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth + 1);
        expect(menu.scrollWidth).toBeLessThanOrEqual(menu.clientWidth + 1);
        notesDisplay.scrollTop = notesDisplay.scrollHeight;
        expect(notesDisplay.scrollTop).toBeGreaterThan(0);
        const row = q(`[data-testid='asset-row-${asset.uuid}']`)!;
        const name = row.querySelector<HTMLElement>("td > div > span[title]")!;
        expect(name.textContent).toBe(asset.name);
        expect(name.getAttribute("title")).toBe(asset.name);
        expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
        expect(getComputedStyle(name).textOverflow).toBe("ellipsis");
        const actions = row.querySelector<HTMLElement>("[aria-label='Asset actions']")!;
        expect(actions.getBoundingClientRect().right).toBeLessThanOrEqual(
          menu.getBoundingClientRect().right + 1
        );
        if (editing) {
          const nameDisplay = q("div[aria-label='Asset name']")!;
          expect(nameDisplay.scrollWidth).toBeLessThanOrEqual(nameDisplay.clientWidth + 1);
          expect(nameDisplay.getBoundingClientRect().height).toBeGreaterThan(20);
        }
      }
    }
  );

  it("keeps a new asset form inside a narrow panel with maximum content", async () => {
    harness.container.style.width = "320px";
    harness.container.style.height = "360px";
    const asset = generateBlankAsset({
      name: "名".repeat(ASSET_NAME_MAX_LENGTH),
      notes: "x".repeat(ASSET_NOTES_MAX_LENGTH),
      uncertaintyMeters: ASSET_RADIUS_MAX_METERS,
    });
    store = makeStore(true);
    render();
    openDraft(asset, true);
    const editor = q("[data-testid='asset-editor']")!;
    const notes = q("textarea[aria-label='Asset notes']") as HTMLTextAreaElement;
    expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth);
    expect(notes.maxLength).toBe(ASSET_NOTES_MAX_LENGTH);
    expect((q("input[aria-label='Asset name']") as HTMLInputElement).maxLength).toBe(
      ASSET_NAME_MAX_LENGTH
    );
    expect(notes.scrollWidth).toBeLessThanOrEqual(notes.clientWidth);
    expect(notes.scrollHeight).toBeGreaterThan(notes.clientHeight);
    expect(q("[aria-label='Save']")?.getAttribute("aria-disabled")).not.toBe("true");
    flushSync(() => q("[aria-label='Save']")!.click());
    await vi.waitFor(() => expect(saveAsset).toHaveBeenCalledTimes(1));
  });

  it("fits the empty add form without scrolling at the default panel size", async () => {
    // The 360px floating widget includes a 30px tab strip.
    harness.container.style.width = "420px";
    harness.container.style.height = "330px";
    store = makeStore(true);
    render();
    openDraft(generateBlankAsset(), true);
    await document.fonts.ready;
    const editor = q("[data-testid='asset-editor']")!;
    expect(editor.scrollHeight).toBeLessThanOrEqual(editor.clientHeight);
    expect(q("[data-testid='assets-map-menu']")!.scrollWidth).toBeLessThanOrEqual(420);
    expect(byText("Radius (m)")).toBeDefined();
  });

  it("ends the table at the last folder without a trailing empty strip", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset", items: [asset.uuid] });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    mockMissionDoc.folders = { [folder.uuid]: folder };
    store = makeStore(true);
    render();
    expect(q("[data-testid='asset-table']")!.getBoundingClientRect().bottom).toBe(
      q(`[data-testid='asset-folder-${folder.uuid}']`)!.getBoundingClientRect().bottom
    );
  });

  it.each([
    { withFolder: false, count: 1 },
    { withFolder: false, count: 3 },
    { withFolder: true, count: 1 },
    { withFolder: true, count: 3 },
  ])(
    "draws dividers only between assets ($count assets, folder: $withFolder)",
    ({ withFolder, count }) => {
      const assets = Array.from({ length: count }, (_, i) =>
        generateBlankAsset({ name: `Asset ${i}` })
      );
      const otherAsset = generateBlankAsset({ name: "Other asset" });
      const folder = generateBlankFolder({
        type: "asset",
        items: withFolder ? assets.map((asset) => asset.uuid) : [otherAsset.uuid],
      });
      mockMissionDoc.assets = Object.fromEntries(
        [...assets, otherAsset].map((asset) => [asset.uuid, asset])
      );
      mockMissionDoc.folders = { [folder.uuid]: folder };
      store = makeStore(true);
      render();

      assets.forEach((asset, index) => {
        flushSync(() => q(`[data-testid='asset-expand-${asset.uuid}']`)!.click());
        const row = q(`[data-testid='asset-row-${asset.uuid}']`)!;
        const editor = q("[data-testid='asset-editor']")!;
        expect(getComputedStyle(row.querySelector("td")!).backgroundImage !== "none").toBe(
          index > 0
        );
        expect(getComputedStyle(editor, "::after").content !== "none").toBe(index < count - 1);
      });
    }
  );

  it.each([1, 6, 7, 20])("scrolls asset notes after six lines (%i lines)", async (lines) => {
    harness.container.style.width = "420px";
    harness.container.style.height = "500px";
    const notes = Array.from({ length: lines }, (_, i) => `Line ${i + 1}`).join("\n");
    const asset = generateBlankAsset({ name: "Drill", notes });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    store = makeStore(true);
    render();
    flushSync(() => q(`[data-testid='asset-expand-${asset.uuid}']`)!.click());
    await document.fonts.ready;

    const checkHeightAndScroll = (element: HTMLElement, maxRows = 6) => {
      const styles = getComputedStyle(element);
      const lineHeight = parseFloat(styles.lineHeight);
      const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      expect(element.clientHeight - padding).toBeLessThanOrEqual(maxRows * lineHeight + 1);
      if (lines > maxRows) {
        expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
        element.scrollTop = element.scrollHeight;
        expect(element.scrollTop).toBeGreaterThan(0);
      } else {
        expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight + 1);
        expect(element.clientHeight - padding).toBeGreaterThanOrEqual(lines * lineHeight - 1);
      }
    };

    checkHeightAndScroll(q("div[aria-label='Asset notes']")!);
    openDraft(asset, false);
    checkHeightAndScroll(q("div[aria-label='Asset notes']")!);
    flushSync(() => q("div[aria-label='Asset notes']")!.click());
    const textarea = q("textarea[aria-label='Asset notes']") as HTMLTextAreaElement;
    await vi.waitFor(() => checkHeightAndScroll(textarea));
    // Shrinking and growing while editing keeps the same six-line cap.
    enterValue(textarea, "Short note");
    expect(textarea.scrollHeight).toBeLessThanOrEqual(textarea.clientHeight + 1);
    enterValue(textarea, notes);
    await vi.waitFor(() => checkHeightAndScroll(textarea));
    flushSync(() => dialogAction("Cancel").click());

    openDraft(asset, true);
    checkHeightAndScroll(q("textarea[aria-label='Asset notes']")!, 3);
  });

  it.each([true, false])(
    "preserves a manually resized notes editor while typing (creating: %s)",
    async (creating) => {
      harness.container.style.width = "420px";
      harness.container.style.height = "600px";
      const asset = generateBlankAsset({ name: "Drill", notes: "Line\n".repeat(20) });
      if (!creating) mockMissionDoc.assets = { [asset.uuid]: asset };
      store = makeStore(true);
      render();
      openDraft(asset, creating);
      if (!creating) flushSync(() => q("div[aria-label='Asset notes']")!.click());
      const textarea = q("textarea[aria-label='Asset notes']") as HTMLTextAreaElement;
      await vi.waitFor(() => expect(textarea.clientHeight).toBeGreaterThan(creating ? 40 : 60));
      expect(getComputedStyle(textarea).resize).toBe("both");
      // Native resize writes inline dimensions; reproduce them to exercise preservation on input.
      textarea.style.height = "240px";
      textarea.style.width = "500px";
      expect(textarea.getBoundingClientRect().height).toBe(240);
      expect(textarea.getBoundingClientRect().width).toBe(500);
      enterValue(textarea, "Updated note");
      expect(textarea.getBoundingClientRect().height).toBe(240);
      expect(textarea.getBoundingClientRect().width).toBe(500);
      if (!creating) {
        await vi.waitFor(() =>
          expect(textarea.closest("form")!.getBoundingClientRect().width).toBe(500)
        );
      }
      textarea.style.height = "70px";
      textarea.style.width = "220px";
      enterValue(textarea, "More lines\n".repeat(20));
      expect(textarea.getBoundingClientRect().height).toBe(70);
      expect(textarea.getBoundingClientRect().width).toBe(220);
      expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight);
      expect(getComputedStyle(textarea).overflowY).toBe("auto");
    }
  );

  it.each([true, false])(
    "blocks over-limit names, notes and radii in the UI (creating: %s)",
    async (creating) => {
      harness.container.style.width = "420px";
      harness.container.style.height = "360px";
      const asset = generateBlankAsset({ name: "Drill" });
      if (!creating) mockMissionDoc.assets = { [asset.uuid]: asset };
      store = makeStore(true);
      render();
      openDraft(asset, creating);
      for (const [label, invalidValue, validValue, message] of [
        [
          "Asset name",
          "n".repeat(ASSET_NAME_MAX_LENGTH + 1),
          "n".repeat(ASSET_NAME_MAX_LENGTH),
          "Name",
        ],
        [
          "Asset notes",
          "x".repeat(ASSET_NOTES_MAX_LENGTH + 1),
          "x".repeat(ASSET_NOTES_MAX_LENGTH),
          "Notes",
        ],
        [
          "Radius in meters",
          String(ASSET_RADIUS_MAX_METERS + 0.01),
          String(ASSET_RADIUS_MAX_METERS),
          "Radius",
        ],
      ]) {
        if (!creating) flushSync(() => q(`div[aria-label='${label}']`)!.click());
        const input = q(`input[aria-label='${label}'], textarea[aria-label='${label}']`) as
          HTMLInputElement | HTMLTextAreaElement;
        // Programmatic input bypasses native maxLength to also exercise validation of existing/imported content.
        enterValue(input, invalidValue);
        if (creating) {
          expect(input.getAttribute("aria-invalid")).toBe("true");
          expect(q("[aria-label='Save']")?.getAttribute("aria-disabled")).toBe("true");
          flushSync(() => q("[aria-label='Save']")!.click());
          expect(saveAsset).not.toHaveBeenCalled();
          if (label === "Radius in meters")
            expect(store.getState().asset.inEdit?.values.uncertaintyMeters).toBe(0);
        } else {
          await vi.waitFor(() => expect(q("dialog[open]")?.textContent).toContain(message));
          flushSync(() => dialogAction("Save").click());
          expect(updateFields).not.toHaveBeenCalled();
        }
        enterValue(input, validValue);
        if (creating) {
          expect(q("[aria-label='Save']")?.getAttribute("aria-disabled")).not.toBe("true");
        } else {
          await vi.waitFor(() => expect(q("dialog[open]")?.textContent).not.toContain(`must be`));
          flushSync(() => dialogAction("Save").click());
          await vi.waitFor(() => expect(updateFields).toHaveBeenCalledTimes(1));
          updateFields.mockClear();
        }
      }
      expect(saveAsset).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    "keeps expanded details compact at the floating widget width (editing: %s)",
    async (editing) => {
      harness.container.style.width = "420px";
      harness.container.style.height = "360px";
      const asset = generateBlankAsset({
        name: "test4",
        uncertaintyMeters: 50,
        color: "#8055ff",
        location: { lat: -84.214738, lng: 33.589402 },
        locationSetAt: 1,
        elevation: 539.71,
        notes: "Near the boulder",
      });
      mockMissionDoc.assets = { [asset.uuid]: asset };
      store = makeStore(true);
      render();
      flushSync(() => q(`[data-testid='asset-expand-${asset.uuid}']`)!.click());
      if (editing)
        flushSync(() =>
          store.dispatch(
            setAssetInEdit({
              uuid: asset.uuid,
              isNew: false,
              values: getAssetEditValues(asset),
              base: getAssetEditValues(asset),
              elevationPending: false,
            })
          )
        );
      await document.fonts.ready;
      const editor = q("[data-testid='asset-editor']")!;
      const radius = q("[data-testid='asset-editor-uncertainty']")!.getBoundingClientRect();
      const color = q("[data-testid='asset-editor-color']")!.getBoundingClientRect();
      expect(Math.abs(radius.top + radius.height / 2 - color.top - color.height / 2)).toBeLessThan(
        3
      );
      expect(editor.getBoundingClientRect().height).toBeLessThan(editing ? 280 : 200);
      expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth);
      if (!editing) {
        expect(q("[aria-label='assetEditToggle']")).toBeNull();
        expect(q("div[aria-label='Asset name']")).toBeNull();
      }
    }
  );

  it.each([false, true])("lets an editor add assets with global Edit set to %s", (editMode) => {
    store = makeStore(true, editMode);
    render();
    expect(q("[data-testid='asset-table-empty']")?.textContent).toBe(
      "No assets added yet. Click Add Asset to add one."
    );
    byText("Add Asset")!.click();
    expect(addAsset).toHaveBeenCalledTimes(1);
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

  it("enables asset and folder controls with the global Edit toggle off", () => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset", name: "Cache", items: [asset.uuid] });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    mockMissionDoc.folders = { [folder.uuid]: folder };
    store = makeStore(true, false);
    render();
    expect(byText("Add Asset")).toBeDefined();
    expect(byText("Add Folder")).toBeDefined();
    expect(q(`[aria-label='Folder actions']`)).not.toBeNull();
    expect(q(`[data-testid='asset-visibility-${asset.uuid}']`)).not.toBeNull();
    expect(q(`[data-testid='asset-folder-visibility-${folder.uuid}']`)).not.toBeNull();
    flushSync(() => q(`[data-testid='asset-expand-${asset.uuid}']`)!.click());
    flushSync(() => q("[aria-label='Asset actions']")!.click());
    const edit = [...harness.container.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
      (item) => item.textContent === "Edit Asset"
    )!;
    flushSync(() => edit.click());
    expect(editAsset).toHaveBeenCalledWith({ assetUuid: asset.uuid });
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
    // Visibility eye buttons are aligned horizontally across folders, folder items, and root items.
    const folderEyeLeft = q(
      `[data-testid='asset-folder-visibility-${alphaFolder.uuid}']`
    )!.getBoundingClientRect().left;
    const inFolderEyeLeft = q(
      `[data-testid='asset-visibility-${inFolder.uuid}']`
    )!.getBoundingClientRect().left;
    const rootEyeLeft = q(`[data-testid='asset-visibility-${alpha.uuid}']`)!.getBoundingClientRect()
      .left;
    expect(inFolderEyeLeft).toBe(rootEyeLeft);
    expect(inFolderEyeLeft).toBe(folderEyeLeft);
    // Nest the caret, emoji, and name together, preserving their spacing.
    const childName = q(`[data-testid='asset-row-${inFolder.uuid}'] td > div`)!;
    const rootName = q(`[data-testid='asset-row-${alpha.uuid}'] td > div`)!;
    [...childName.children].forEach((element, index) => {
      expect(
        element.getBoundingClientRect().left - rootName.children[index].getBoundingClientRect().left
      ).toBe(10);
    });
    expect(
      rootName.children[1].getBoundingClientRect().left -
        rootName.children[0].getBoundingClientRect().right
    ).toBe(3);
    expect(harness.container.querySelectorAll("[aria-label='Asset actions']")).toHaveLength(3);
    expect(q(`[data-testid='asset-row-${zed.uuid}']`)?.textContent).toContain("Not placed");
  });

  it.each([0, 5])("shows chosen or transparent emoji backgrounds at radius %s", (radius) => {
    const colored = generateBlankAsset({ color: "#ff0000", uncertaintyMeters: radius });
    const uncolored = generateBlankAsset({ color: null, uncertaintyMeters: radius });
    mockMissionDoc.assets = { [colored.uuid]: colored, [uncolored.uuid]: uncolored };
    store = makeStore(true);
    render();
    const nameCell = (uuid: string) => q(`[data-testid='asset-row-${uuid}'] td`)!;
    const coloredBackground = nameCell(colored.uuid).querySelector("div > span") as HTMLElement;
    const uncoloredBackground = nameCell(uncolored.uuid).querySelector("div > span") as HTMLElement;
    expect(coloredBackground.style.backgroundColor).toBe("rgba(255, 0, 0, 0.5)");
    expect(uncoloredBackground.style.backgroundColor).toBe("transparent");
    expect(getComputedStyle(nameCell(colored.uuid)).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(coloredBackground).borderRadius).toBe("45%");
  });

  it.each([false, true])("toggles folders from the header or icon (can edit: %s)", (canEdit) => {
    const asset = generateBlankAsset({ name: "Drill" });
    const folder = generateBlankFolder({ type: "asset", name: "Cache", items: [asset.uuid] });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    mockMissionDoc.folders = { [folder.uuid]: folder };
    store = makeStore(canEdit);
    render();

    const group = q(`[data-testid='asset-folder-${folder.uuid}']`)!;
    const header = group.querySelector("tr")!;
    const toggle = header.querySelector("button")!;
    expect(toggle.querySelectorAll("svg")).toHaveLength(1);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    // The name and unused header space toggle just like the folder icon.
    flushSync(() => q("[aria-label='Folder name']")!.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(q(`[data-testid='asset-row-${asset.uuid}']`)).toBeNull();
    flushSync(() => header.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(q(`[data-testid='asset-row-${asset.uuid}']`)).not.toBeNull();
    flushSync(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    if (canEdit) {
      // Menu actions and the rename input must not toggle the folder.
      flushSync(() => q("[aria-label='Folder actions']")!.click());
      const rename = [...group.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
        (item) => item.textContent === "Rename Folder"
      )!;
      flushSync(() => rename.click());
      flushSync(() => q("input[aria-label='Folder name']")!.click());
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("turns the viewer's Assets and Asset Labels back on when placing starts", () => {
    store = makeStore(true);
    render();
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: "new-asset",
          isNew: true,
          values: getAssetEditValues(generateBlankAsset()),
          base: null,
          elevationPending: false,
        })
      )
    );
    expect(q("[data-testid='asset-editor']")?.textContent).toContain("Add Asset");
    expect(q("[aria-label='Save']")).not.toBeNull();
    expect(q("[aria-label='Cancel']")).not.toBeNull();
    expect(q("[aria-label='assetEditToggle']")).toBeNull();
    expect(byText("Place on Map")).toBeDefined();
    // The editor has no folder field.
    expect(q("[data-testid='asset-editor'] [aria-label='Asset folder']")).toBeNull();

    flushSync(() => byText("Place on Map")!.click());
    expect(menuSettings!.submenuAssets).toEqual({ show: true, showLabels: true });
    expect(startMapDirective).toHaveBeenCalledTimes(1);
  });

  it("shows coordinate validation errors while typing, without waiting for blur", async () => {
    store = makeStore(true);
    render();
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: "new-asset",
          isNew: true,
          values: getAssetEditValues(generateBlankAsset()),
          base: null,
          elevationPending: false,
        })
      )
    );
    const input = q("[data-testid='asset-editor-coordinates']") as HTMLInputElement;
    // Controlled React input: write through the native value setter so onChange fires.
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const type = (text: string) => {
      setValue.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    type("-91, 0");
    await vi.waitFor(() =>
      expect(q("[data-testid='asset-editor-coordinate-error']")?.textContent).toMatch(/Latitude/)
    );

    // Correcting the text clears the error without a blur, too.
    type("-89.5, 45.2");
    await vi.waitFor(() => expect(q("[data-testid='asset-editor-coordinate-error']")).toBeNull());
  });

  it.each(["-91, 0", "-89.5,"])(
    "blocks creation with invalid coordinates %s and submits corrected coordinates on Save",
    async (text) => {
      store = makeStore(true);
      render();
      openDraft(generateBlankAsset({ name: "Drill" }), true);
      const input = q("[data-testid='asset-editor-coordinates']") as HTMLInputElement;
      input.focus();
      enterValue(input, text);
      expect(q("[aria-label='Save']")!.getAttribute("aria-disabled")).toBe("true");
      await userEvent.click(q("[aria-label='Save']")!);
      expect(saveAsset).not.toHaveBeenCalled();
      expect(setLocation).not.toHaveBeenCalled();

      enterValue(input, "-89.5, 45.2");
      expect(q("[aria-label='Save']")!.getAttribute("aria-disabled")).toBe("false");
      flushSync(() => q("[aria-label='Save']")!.click());
      await vi.waitFor(() => expect(saveAsset).toHaveBeenCalledTimes(1));
      expect(setLocation).toHaveBeenCalledWith({
        uuid: store.getState().asset.inEdit!.uuid,
        location: { lat: -89.5, lng: 45.2 },
      });
      expect(setLocation.mock.invocationCallOrder[0]).toBeLessThan(
        saveAsset.mock.invocationCallOrder[0]
      );
    }
  );

  it.each([false, true])(
    "does not submit an unchanged position (LGRS: %s)",
    (usingLGRSCoordinates) => {
      const point = { lat: -89.500012345, lng: 45.200012345 };
      mockMissionDoc.usingLGRSCoordinates = usingLGRSCoordinates;
      mockMissionDoc.landerLocation = point;
      mockMissionDoc.planetRadius = 1737400;
      const asset = generateBlankAsset({ name: "Drill", location: point, locationSetAt: 123456 });
      mockMissionDoc.assets = { [asset.uuid]: asset };
      store = makeStore(true);
      render();
      openDraft(asset, false);
      flushSync(() => q("div[aria-label='Asset coordinates']")!.click());
      const input = q("dialog[open] input") as HTMLInputElement;
      expect(input.value).not.toBe("");
      enterValue(input, ` ${input.value} `);
      flushSync(() => dialogAction("Save").click());
      expect(setLocation).not.toHaveBeenCalled();

      flushSync(() => q("div[aria-label='Asset coordinates']")!.click());
      enterValue(q("dialog[open] input") as HTMLInputElement, "-89.6, 45.3");
      flushSync(() => dialogAction("Save").click());
      expect(setLocation).toHaveBeenCalledExactlyOnceWith({
        uuid: asset.uuid,
        location: { lat: -89.6, lng: 45.3 },
        saveImmediately: true,
      });
    }
  );

  it("uses the standard field modals to save or cancel individual fields", async () => {
    const asset = generateBlankAsset({ name: "Drill" });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    store = makeStore(true);
    render();
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: asset.uuid,
          isNew: false,
          values: getAssetEditValues(asset),
          base: getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
    const changeInput = (label: string, value: string) => {
      const input = q(`dialog[open] input[aria-label='${label}']`) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const clickAction = (label: string) => {
      const action = [...q("dialog[open]")!.querySelectorAll<HTMLElement>("div")].find(
        (el) => el.textContent === label && el.children.length === 0
      )!;
      flushSync(() => action.click());
    };
    flushSync(() => q("div[aria-label='Asset name']")!.click());
    changeInput("Asset name", "Canceled name");
    await vi.waitFor(() =>
      expect((q("dialog[open] input") as HTMLInputElement).value).toBe("Canceled name")
    );
    clickAction("Cancel");
    expect(q("dialog[open]")).toBeNull();
    expect(updateFields).not.toHaveBeenCalled();

    flushSync(() => q("div[aria-label='Asset name']")!.click());
    expect((q("dialog[open] input") as HTMLInputElement).value).toBe("Drill");
    changeInput("Asset name", "Renamed drill");
    await vi.waitFor(() =>
      expect((q("dialog[open] input") as HTMLInputElement).value).toBe("Renamed drill")
    );
    await userEvent.keyboard("{Enter}");
    expect(q("dialog[open]")).toBeNull();
    expect(updateFields).toHaveBeenCalledWith({
      assetUuid: asset.uuid,
      changes: { name: "Renamed drill" },
    });
    expect(store.getState().asset.inEdit?.uuid).toBe(asset.uuid);

    flushSync(() => q("div[aria-label='Radius in meters']")!.click());
    changeInput("Radius in meters", "-5");
    await vi.waitFor(() =>
      expect(q("dialog[open]")?.textContent).toContain("Radius must be between")
    );
    clickAction("Save");
    await userEvent.keyboard("{Enter}");
    expect(q("dialog[open]")).not.toBeNull();
    expect(updateFields).toHaveBeenCalledTimes(1);
    changeInput("Radius in meters", "");
    await vi.waitFor(() =>
      expect(q("dialog[open]")?.textContent).not.toContain("Must be a number")
    );
    clickAction("Save");
    expect(updateFields).toHaveBeenLastCalledWith({
      assetUuid: asset.uuid,
      changes: { uncertaintyMeters: 0 },
    });
    flushSync(() => q("[aria-label='Asset actions']")!.click());
    const stopEditing = [
      ...harness.container.querySelectorAll<HTMLElement>("[role='menuitem']"),
    ].find((item) => item.textContent === "Turn Off Edit Mode")!;
    flushSync(() => stopEditing.click());
    expect(store.getState().asset.inEdit).toBeNull();
    expect(q("dialog[open]")).toBeNull();
    expect(q("div[aria-label='Asset name']")).toBeNull();
    flushSync(() => q("div[aria-label='Radius in meters']")!.click());
    expect(q("dialog[open]")).toBeNull();
  });

  it.each([false, true])(
    "uses floating appearance pickers outside clipped panels (creating: %s)",
    async (creating) => {
      Object.assign(harness.container.style, {
        width: "420px",
        height: "240px",
        overflow: "hidden",
        transform: "translate(60px, 40px)",
      });
      const asset = generateBlankAsset({ name: "Drill", icon: "1f929", color: null });
      mockMissionDoc.assets = creating ? {} : { [asset.uuid]: asset };
      store = makeStore(true);
      render();
      flushSync(() =>
        store.dispatch(
          setAssetInEdit({
            uuid: asset.uuid,
            isNew: creating,
            values: getAssetEditValues(asset),
            base: creating ? null : getAssetEditValues(asset),
            elevationPending: false,
          })
        )
      );
      const color = q("[data-testid='asset-editor-color']")!;
      const editor = q("[data-testid='asset-editor']")!;
      const originalHeight = editor.getBoundingClientRect().height;
      const expectFloating = (picker: HTMLElement) => {
        expect(picker.matches(":popover-open")).toBe(true);
        expect(editor.getBoundingClientRect().height).toBe(originalHeight);
        const bounds = picker.getBoundingClientRect();
        const panel = editor.getBoundingClientRect();
        const container = harness.container.getBoundingClientRect();
        const clippedBottom = Math.min(panel.bottom, container.bottom);
        const clippedTop = Math.max(panel.top, container.top);
        expect(bounds.bottom > clippedBottom || bounds.top < clippedTop).toBe(true);
        expect(bounds.left).toBeGreaterThanOrEqual(8);
        expect(bounds.right).toBeLessThanOrEqual(window.innerWidth - 8);
        const y = bounds.bottom > clippedBottom ? bounds.bottom - 8 : bounds.top + 8;
        expect(picker.contains(document.elementFromPoint(bounds.left + bounds.width / 2, y))).toBe(
          true
        );
      };
      const preview = color.firstElementChild!.firstElementChild!.firstElementChild as HTMLElement;
      expect(getComputedStyle(preview).borderRadius).toBe("50%");
      expect(preview.getBoundingClientRect().width).toBe(preview.getBoundingClientRect().height);
      flushSync(() => (color.firstElementChild!.firstElementChild as HTMLElement).click());
      expect(q("dialog[open]")).toBeNull();
      const colorPopover = q("[popover]")!;
      await vi.waitFor(() => expectFloating(colorPopover));
      const swatch = q(".w-color-compact .w-color-swatch [title]")!;
      expect(getComputedStyle(swatch).borderRadius).toBe("50%");
      const selected = swatch.title.toLowerCase();
      flushSync(() => swatch.click());
      if (creating) expect(store.getState().asset.inEdit?.values.color).toBe(selected);
      else
        expect(updateFields).toHaveBeenCalledWith({
          assetUuid: asset.uuid,
          changes: { color: selected },
        });
      await userEvent.keyboard("{Escape}");
      await vi.waitFor(() => expect(q("[popover]:popover-open")).toBeNull());
      flushSync(() => byText("Pick Icon")!.click());
      expect(byText("Close")).toBeDefined();
      expect(q("dialog[open]")).toBeNull();
      await vi.waitFor(() => {
        const emojiPopover = q("[popover]:popover-open")!;
        expect(emojiPopover.getBoundingClientRect().height).toBeGreaterThan(250);
        expectFloating(emojiPopover);
      });
      expect(byText("No emoji")).toBeUndefined();
      const emoji = q("em-emoji-picker")!.shadowRoot!.querySelector<HTMLButtonElement>(
        "button[aria-label='\u{1f600}']"
      )!;
      flushSync(() => emoji.click());
      if (creating) expect(store.getState().asset.inEdit?.values.icon).toBe("1f600");
      else
        expect(updateFields).toHaveBeenCalledWith({
          assetUuid: asset.uuid,
          changes: { icon: "1f600" },
        });
      expect(byText("Pick Icon")).toBeDefined();
    }
  );

  it.each([false, true])("allows clearing Position (creating: %s)", async (creating) => {
    const asset = generateBlankAsset({
      name: "Drill",
      location: { lat: 1, lng: 2 },
      locationSetAt: 1,
      uncertaintyMeters: 20,
    });
    if (!creating) mockMissionDoc.assets = { [asset.uuid]: asset };
    store = makeStore(true);
    render();
    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: asset.uuid,
          isNew: creating,
          values: getAssetEditValues(asset),
          base: creating ? null : getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
    const clearInput = (input: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    if (creating) {
      const radius = q("[aria-label='Radius in meters']") as HTMLInputElement;
      radius.focus();
      clearInput(radius);
      await vi.waitFor(() =>
        expect(store.getState().asset.inEdit?.values.uncertaintyMeters).toBe(0)
      );
      radius.blur();
      await vi.waitFor(() => expect(radius.value).toBe("0"));
      expect(q("[aria-label='Save']")?.getAttribute("aria-disabled")).not.toBe("true");
    } else {
      flushSync(() => q("div[aria-label='Asset coordinates']")!.click());
    }
    const position = q("input[aria-label='Asset coordinates']") as HTMLInputElement;
    position.focus();
    clearInput(position);
    await vi.waitFor(() => expect(position.value).toBe(""));
    if (creating) position.blur();
    else flushSync(() => dialogAction("Save").click());
    await vi.waitFor(() =>
      expect(setLocation).toHaveBeenCalledWith({
        uuid: asset.uuid,
        location: null,
        ...(!creating ? { saveImmediately: true } : {}),
      })
    );
  });

  it("edits and clears PET during planning and prevents saving invalid text", async () => {
    const asset = generateBlankAsset({
      name: "Drill",
      petSeconds: 600,
      petRex: { uuid: "rex", name: "Recorded REX" },
    });
    mockMissionDoc.assets = { [asset.uuid]: asset };
    store = makeStore(true);
    render();
    expect(q(`[data-testid='asset-row-${asset.uuid}']`)?.textContent).not.toContain("+00:10:00");
    flushSync(() => q(`[data-testid='asset-expand-${asset.uuid}']`)!.click());
    expect(q("[data-testid='asset-editor-pet']")?.textContent).toBe("+00:10:00");
    expect(q("[data-testid='asset-editor-rex']")?.textContent).toBe("Recorded REX");
    expect(q("[data-testid='asset-editor-placement']")).toBeNull();

    flushSync(() =>
      store.dispatch(
        setAssetInEdit({
          uuid: asset.uuid,
          isNew: false,
          values: getAssetEditValues(asset),
          base: getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
    expect(q("[aria-label='Save']")).toBeNull();
    flushSync(() => q("div[aria-label='Asset PET']")!.click());
    const input = q("[data-testid='asset-editor-pet-input']") as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const type = (text: string) => {
      setValue.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    expect(input.disabled).toBe(false);
    type("abc12:34:56def");
    await vi.waitFor(() => expect(input.value).toBe("12:34:56"));
    expect(store.getState().asset.inEdit?.values.petSeconds).toBe(600);
    type("-00:00:30");
    await vi.waitFor(() => expect(input.value).toBe("-00:00:30"));
    for (const invalid of [
      "+00:60:00",
      "+00:00:60",
      "12:34",
      "++12:00:00",
      "99999999999999999:00:00",
    ]) {
      type(invalid);
      await vi.waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
      flushSync(() => dialogAction("Save").click());
      expect(updateFields).not.toHaveBeenCalled();
    }

    type("");
    await vi.waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("false"));
    expect(mockMissionDoc.assets[asset.uuid].petSeconds).toBe(600);
    flushSync(() => dialogAction("Save").click());
    await vi.waitFor(() =>
      expect(updateFields).toHaveBeenCalledWith({
        assetUuid: asset.uuid,
        changes: { petSeconds: null },
      })
    );
    expect(store.getState().asset.inEdit?.uuid).toBe(asset.uuid);
    flushSync(() => q("[aria-label='assetEditToggle']")!.click());
    expect(store.getState().asset.inEdit).toBeNull();
    expect(q(`[data-testid='asset-detail-row-${asset.uuid}']`)).not.toBeNull();
  });

  it.each([true, false])(
    "fills current PET immediately and leaves it editable (creating: %s)",
    async (creating) => {
      const asset = generateBlankAsset({ name: "Drill", petSeconds: 600 });
      const rex = generateBlankRex({
        evaUuid: "eva",
        isRunning: true,
        petValueAtStartStop: "-00:02:30",
      });
      if (!creating) mockMissionDoc.assets = { [asset.uuid]: asset };
      mockMissionDoc.rexes = { [rex.uuid]: rex };
      store = makeStore(true);
      render();
      flushSync(() =>
        store.dispatch(
          setAssetInEdit({
            uuid: asset.uuid,
            isNew: creating,
            values: getAssetEditValues(asset),
            base: creating ? null : getAssetEditValues(asset),
            elevationPending: false,
          })
        )
      );
      if (!creating) flushSync(() => q("div[aria-label='Asset PET']")!.click());
      const input = q("input[aria-label='Asset PET']") as HTMLInputElement;
      expect(q("select[aria-label='PET update']")).toBeNull();
      flushSync(() => q("[aria-label='Set to current PET']")!.click());
      await vi.waitFor(() => expect(input.value).toBe("-00:02:30"));
      expect(input.disabled).toBe(false);
      expect(updateFields).not.toHaveBeenCalled();
      expect(saveAsset).not.toHaveBeenCalled();
      enterValue(input, "+00:60:00");
      await vi.waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
      flushSync(() => {
        if (creating) q("[aria-label='Save']")!.click();
        else dialogAction("Save").click();
      });
      expect(updateFields).not.toHaveBeenCalled();
      expect(saveAsset).not.toHaveBeenCalled();
      // Changing the clock after filling must not change the value that will be saved.
      mockMissionDoc.rexes[rex.uuid] = { ...rex, petValueAtStartStop: "+01:00:00" };
      enterValue(input, "abc+00:03:00def");
      await vi.waitFor(() => expect(input.value).toBe("+00:03:00"));
      if (creating) {
        expect(store.getState().asset.inEdit?.values.petSeconds).toBe(180);
        flushSync(() => q("[aria-label='Save']")!.click());
        expect(saveAsset).toHaveBeenCalledWith(undefined);
      } else {
        flushSync(() => dialogAction("Save").click());
        expect(updateFields).toHaveBeenCalledWith({
          assetUuid: asset.uuid,
          changes: { petSeconds: 180 },
        });
      }
    }
  );

  it.each([true, false])("hides current PET without a running REX (creating: %s)", (creating) => {
    const asset = generateBlankAsset({ name: "Drill", petSeconds: 600 });
    const rex = generateBlankRex({ evaUuid: "eva", isRunning: false });
    mockMissionDoc.rexes = { [rex.uuid]: rex };
    if (!creating) mockMissionDoc.assets = { [asset.uuid]: asset };
    store = makeStore(true);
    render();
    openDraft(asset, creating);
    if (!creating) flushSync(() => q("div[aria-label='Asset PET']")!.click());
    expect(q("[aria-label='Set to current PET']")).toBeNull();
    expect((q("input[aria-label='Asset PET']") as HTMLInputElement).value).toBe("+00:10:00");
  });

  it("disables Edit Pos. for an asset hidden by its folder, naming the folder", () => {
    const asset = generateBlankAsset({
      name: "Drill",
      location: { lat: 1, lng: 1 },
      locationSetAt: 1,
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
        setAssetInEdit({
          uuid: asset.uuid,
          isNew: false,
          values: getAssetEditValues(asset),
          base: getAssetEditValues(asset),
          elevationPending: false,
        })
      )
    );
    const editPos = byText("Edit Pos.")!.parentElement!;
    expect(editPos.getAttribute("data-tooltip-content")).toContain('"Cache"');
    flushSync(() => editPos.click());
    expect(startMapDirective).not.toHaveBeenCalled();
    expect(q("[data-testid='asset-editor-coordinates']")?.hasAttribute("disabled")).toBe(false);
  });

  it("cancels an in-progress edit or add inEdit when selecting another row", () => {
    const first = generateBlankAsset({ name: "First" });
    const second = generateBlankAsset({ name: "Second" });
    mockMissionDoc.assets = { [first.uuid]: first, [second.uuid]: second };
    store = makeStore(true);
    render();

    // Editing 'first': clicking 'first' itself keeps it selected and does not cancel.
    flushSync(() => {
      store.dispatch(assetSlice.actions.setSelectedAssetUuid(first.uuid));
      store.dispatch(
        setAssetInEdit({
          uuid: first.uuid,
          isNew: false,
          values: getAssetEditValues(first),
          base: getAssetEditValues(first),
          elevationPending: false,
        })
      );
    });
    flushSync(() => q(`[data-testid='asset-row-${first.uuid}']`)!.click());
    expect(cancelEdit).not.toHaveBeenCalled();
    expect(store.getState().asset.selectedAssetUuid).toBe(first.uuid);

    // Selecting 'second' cancels the open edit, collapses 'first', and selects 'second'.
    flushSync(() => q(`[data-testid='asset-row-${second.uuid}']`)!.click());
    expect(cancelEdit).toHaveBeenCalledTimes(1);
    expect(store.getState().asset.expandedAssetUuid).toBeNull();
    expect(store.getState().asset.selectedAssetUuid).toBe(second.uuid);

    // Adding a new asset: selecting any row cancels the add session.
    cancelEdit.mockClear();
    flushSync(() => {
      store.dispatch(assetSlice.actions.setSelectedAssetUuid("new-asset"));
      store.dispatch(
        setAssetInEdit({
          uuid: "new-asset",
          isNew: true,
          values: getAssetEditValues(generateBlankAsset()),
          base: null,
          elevationPending: false,
        })
      );
    });
    flushSync(() => q(`[data-testid='asset-row-${first.uuid}']`)!.click());
    expect(cancelEdit).toHaveBeenCalledTimes(1);
    expect(store.getState().asset.selectedAssetUuid).toBe(first.uuid);
  });

  it.each([false, true])(
    "twirls open one row at a time and opens the edit form (folders: %s)",
    async (withFolders) => {
      const first = generateBlankAsset({ name: "First", notes: "First note", icon: "1f929" });
      const second = generateBlankAsset({ name: "Second", notes: "Second note" });
      mockMissionDoc.assets = { [first.uuid]: first, [second.uuid]: second };
      if (withFolders) {
        const folder = generateBlankFolder({ type: "asset", name: "Cache", items: [first.uuid] });
        mockMissionDoc.folders = { [folder.uuid]: folder };
      }
      store = makeStore(true);
      render();
      await document.fonts.ready;

      // Expanding 'first' opens its read-only details row without form inputs or selecting it.
      const firstRow = q(`[data-testid='asset-row-${first.uuid}']`)!;
      const collapsedHeight = firstRow.getBoundingClientRect().height;
      const collapsedToggleTop = firstRow.querySelector("button")!.getBoundingClientRect().top;
      flushSync(() => q(`[data-testid='asset-expand-${first.uuid}']`)!.click());
      expect(firstRow.getBoundingClientRect().height).toBe(collapsedHeight);
      expect(firstRow.querySelector("button")!.getBoundingClientRect().top).toBe(
        collapsedToggleTop
      );
      expect(store.getState().asset.selectedAssetUuid).toBeNull();
      const firstRowCells = q(`[data-testid='asset-row-${first.uuid}']`)!.querySelectorAll("td");
      const secondRowCells = q(`[data-testid='asset-row-${second.uuid}']`)!.querySelectorAll("td");
      firstRowCells.forEach((cell, index) => {
        expect(cell.getBoundingClientRect().left).toBe(
          secondRowCells[index].getBoundingClientRect().left
        );
        expect(cell.getBoundingClientRect().width).toBe(
          secondRowCells[index].getBoundingClientRect().width
        );
      });
      const firstDetail = q(`[data-testid='asset-detail-row-${first.uuid}']`);
      expect(firstDetail).not.toBeNull();
      expect(firstDetail?.textContent).not.toContain("Asset Details");
      expect(firstDetail?.querySelector("[aria-label='Edit'], [aria-label='Delete']")).toBeNull();
      expect(firstDetail?.querySelectorAll("dialog[open]")).toHaveLength(0);
      expect(q("[data-testid='asset-editor-name']")).toBeNull();
      expect(q("[data-testid='asset-editor-emoji']")).toBeNull();
      expect(q("[data-testid='asset-editor-notes'] [aria-label='Asset notes']")?.textContent).toBe(
        "First note"
      );
      // Expanded headers and details share a background without an outline or an internal gap.
      const detailCellStyle = getComputedStyle(firstDetail!.querySelector("td")!);
      expect(getComputedStyle(firstRow).backgroundColor).toBe(
        getComputedStyle(firstDetail!).backgroundColor
      );
      expect(getComputedStyle(firstRowCells[0]).borderTopWidth).toBe("0px");
      expect(getComputedStyle(firstRowCells[0]).borderLeftWidth).toBe("0px");
      expect(getComputedStyle(firstRowCells[firstRowCells.length - 1]).borderRightWidth).toBe(
        "0px"
      );
      expect(detailCellStyle.borderTopWidth).toBe("0px");
      expect(detailCellStyle.borderLeftWidth).toBe("0px");
      expect(detailCellStyle.borderRightWidth).toBe("0px");
      expect(detailCellStyle.borderBottomWidth).toBe("0px");
      expect(getComputedStyle(q("[data-testid='asset-editor']")!).borderTopWidth).toBe("0px");
      const nextCellStyle = getComputedStyle(
        q(`[data-testid='asset-row-${second.uuid}']`)!.querySelector("td")!
      );
      expect(nextCellStyle.borderTopWidth).toBe("0px");
      flushSync(() => firstRow.click());
      expect(getComputedStyle(firstRow).backgroundColor).toBe("rgb(224, 224, 224)");
      expect(getComputedStyle(firstRow).color).toBe("rgb(0, 0, 0)");
      expect(getComputedStyle(firstRowCells[0]).color).toBe("rgb(0, 0, 0)");

      // Expanding 'second' collapses 'first' so only one row is expanded at a time.
      flushSync(() => q(`[data-testid='asset-expand-${second.uuid}']`)!.click());
      expect(q(`[data-testid='asset-detail-row-${first.uuid}']`)).toBeNull();
      expect(q(`[data-testid='asset-detail-row-${second.uuid}']`)).not.toBeNull();

      // The row menu acts on its asset without changing selection or expansion.
      const secondRow = q(`[data-testid='asset-row-${second.uuid}']`)!;
      const openActions = () =>
        flushSync(() =>
          secondRow.querySelector<HTMLButtonElement>("[aria-label='Asset actions']")!.click()
        );
      const menuItem = (label: string) =>
        [...secondRow.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
          (item) => item.textContent === label
        )!;
      openActions();
      expect(store.getState().asset.selectedAssetUuid).toBe(first.uuid);
      expect(store.getState().asset.expandedAssetUuid).toBe(second.uuid);
      flushSync(() => menuItem("Edit Asset").click());
      expect(editAsset).toHaveBeenCalledWith({ assetUuid: second.uuid });
      expect(secondRow.querySelector("dialog")!.open).toBe(false);
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      openActions();
      flushSync(() => menuItem("Delete Asset").click());
      expect(deleteAsset).not.toHaveBeenCalled();
      confirmSpy.mockReturnValue(true);
      openActions();
      flushSync(() => menuItem("Delete Asset").click());
      expect(deleteAsset).toHaveBeenCalledWith({ assetUuid: second.uuid });
      confirmSpy.mockRestore();

      // Opening an edit session on 'first' expands 'first' in edit mode inside its row.
      flushSync(() =>
        store.dispatch(
          setAssetInEdit({
            uuid: first.uuid,
            isNew: false,
            values: getAssetEditValues(first),
            base: getAssetEditValues(first),
            elevationPending: false,
          })
        )
      );
      expect(q(`[data-testid='asset-detail-row-${second.uuid}']`)).toBeNull();
      expect(q(`[data-testid='asset-detail-row-${first.uuid}']`)?.textContent).toContain(
        "Edit Asset"
      );
      expect(q("[aria-label='assetEditToggle']")).not.toBeNull();
      expect(q("dialog[open]")).toBeNull();
      expect(q("[aria-label='Save']")).toBeNull();
      expect(getComputedStyle(firstRow).backgroundColor).toBe("rgb(224, 224, 224)");
      expect(
        getComputedStyle(q(`[data-testid='asset-detail-row-${first.uuid}']`)!.querySelector("td")!)
          .borderBottomWidth
      ).toBe("0px");
    }
  );
});
