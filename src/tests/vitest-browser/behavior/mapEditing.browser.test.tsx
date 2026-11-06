import { commands } from "vitest/browser";
import { exactText } from "./browserAssertions";
import type { BrowserPage as Page, Locator } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { readMapFeatures } from "./mapObserver";
import { mapFeaturePixel, expectMapLabel } from "./mapInteractions";
import {
  enablePlanningEditMode,
  selectPlanningEva,
  selectPlanningPoi,
  selectPlanningStation,
} from "./planningHelpers";

async function mapMenu(page: Page): Promise<Locator> {
  const panel = page.getByTestId("map-menu-floating-panel");
  await page.getByTestId("map-menu-launcher").click();
  await expect.element(panel).toBeVisible();
  return panel;
}

async function selectTraverse(page: Page): Promise<void> {
  await selectPlanningEva(page, "Survey Alpha");
  await page
    .getByLabelText("evaList-item")
    .filter({ hasText: "Survey Alpha" })
    .getByText("Alpha to Bravo", { exact: true })
    .click();
  await expect.element(page.getByLabelText("Edit Path on Map", { exact: true })).toBeVisible();
}

async function dragVertex(page: Page, id: string, vertex: number): Promise<AEGISPoint> {
  const pixel = await mapFeaturePixel(id, "editor", vertex);
  await (() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    ).map;
    Reflect.deleteProperty(window, "aegisDragDestination");
    document.addEventListener(
      "pointerup",
      (event) => {
        const bounds = map.getTargetElement().getBoundingClientRect();
        const [east, north] = map.getCoordinateFromPixel([
          event.clientX - bounds.left,
          event.clientY - bounds.top,
        ]);
        Reflect.set(window, "aegisDragDestination", {
          lng: ((east / 6378137) * 180) / Math.PI,
          lat: ((2 * Math.atan(Math.exp(north / 6378137)) - Math.PI / 2) * 180) / Math.PI,
        });
      },
      { once: true, capture: true }
    );
  })();
  await commands.mapPointer("move", pixel.x, pixel.y);
  await commands.mapPointer("down");
  await commands.mapPointer("move", pixel.x + 45, pixel.y - 35, 12);
  await commands.mapPointer("up");
  return (() => Reflect.get(window, "aegisDragDestination"))();
}

async function featureIds(page: Page, layerZIndex: number): Promise<string[]> {
  return (await readMapFeatures())
    .filter((feature) => feature.layerZIndex === layerZIndex && feature.visible)
    .map((feature) => feature.id)
    .sort();
}

test.describe("Map display contracts", () => {
  for (const category of ["POIs", "Stations"] as const) {
    test(`${category} labels change rendered content and their preference survives remount`, async ({
      page,
      mission,
    }) => {
      await mission.open();
      const type = category === "POIs" ? "poi" : "station";
      const expectedNames =
        category === "POIs" ? ["Reference POI"] : ["Alpha station", "Bravo station"];
      const labelNames = async () =>
        (await readMapFeatures())
          .filter((feature) => feature.labelType === type && feature.visible)
          .map((feature) => feature.name)
          .sort();
      await expect.poll(labelNames).toEqual([]);
      const viewport = page.getBySelector('[data-map-mode="editor"] .ol-viewport');
      const withoutLabels = await viewport.screenshot({ base64: true });

      const menu = await mapMenu(page);
      await menu
        .getByText(category, { exact: true })
        .getBySelector("..")
        .getByText("Labels", { exact: true })
        .click();
      await expect.poll(labelNames).toEqual(expectedNames);
      for (const name of expectedNames) await expectMapLabel(name);
      await menu.getBySelector('svg[data-icon="xmark"]').click();
      await expect.poll(() => menu.length).toBe(0);
      await commands.mapPointer("move", 0, 0);
      const withLabels = await viewport.screenshot({ base64: true });
      expect(
        withLabels.base64 === withoutLabels.base64,
        "Enabling labels changes the actual map image"
      ).toBe(false);

      await mission.open();
      await expect.poll(labelNames).toEqual(expectedNames);
      const restoredMenu = await mapMenu(page);
      await restoredMenu
        .getByText(category, { exact: true })
        .getBySelector("..")
        .getByText("Labels", { exact: true })
        .click();
      await expect.poll(labelNames).toEqual([]);
      expect(
        Object.values((await mission.read())[type === "poi" ? "pois" : "stations"]).some(
          (entity) => entity.name === expectedNames[0]
        )
      ).toBe(true);
    });
  }

  test("hiding POIs preserves the selected POI until it is deselected", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await expect.poll(() => featureIds(page, 15)).toEqual([mission.ids.poiA]);
    await selectPlanningPoi(page, "Reference POI");
    const menu = await mapMenu(page);
    await menu
      .getByText("POIs", { exact: true })
      .getBySelector("..")
      .getBySelector('svg[data-icon="eye"]')
      .click();
    await expect.poll(() => featureIds(page, 15)).toEqual([mission.ids.poiA]);
    await page.getByLabelText("poiList-item").getByText("Reference POI", { exact: true }).click();
    await expect.poll(() => featureIds(page, 15)).toEqual([]);
    expect((await mission.read()).pois[mission.ids.poiA].name).toBe("Reference POI");
  });

  test("clicking a real station marker selects that station and its information", async ({
    page,
    mission,
  }) => {
    await mission.open();
    const initialZoom = await (() =>
      window.__aegisMaps
        .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
        .map.getView()
        .getZoom())();
    await page.getBySelector('[data-map-mode="editor"] .ol-zoom-out').click();
    await expect
      .poll(() =>
        (() =>
          window.__aegisMaps
            .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
            .map.getView()
            .getZoom())()
      )
      .toBeCloseTo(initialZoom - 1, 6);
    await expect
      .poll(() =>
        (() =>
          window.__aegisMaps
            .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
            .map.getView()
            .getAnimating())()
      )
      .toBe(false);
    const pixel = await mapFeaturePixel(mission.ids.stationB);
    const bounds = await page
      .getBySelector('[data-map-mode="editor"] .ol-viewport')
      .element()
      .getBoundingClientRect();
    expect(pixel.x).toBeGreaterThan(bounds.x);
    expect(pixel.x).toBeLessThan(bounds.x + bounds.width);
    expect(pixel.y).toBeGreaterThan(bounds.y);
    expect(pixel.y).toBeLessThan(bounds.y + bounds.height);
    await commands.mapPointer("click", pixel.x, pixel.y);
    await expect
      .element(page.getBySelector('div[aria-label="Station"]'))
      .toHaveTextContent(exactText("Bravo station"));
    await expect
      .element(page.getByLabelText("leftPanelTitle", { exact: true }))
      .toHaveTextContent(exactText("Stations"));
  });

  test("scale bar visibility survives remount without changing mission data", async ({
    page,
    mission,
  }) => {
    const before = await mission.read();
    await mission.open();
    await expect.element(page.getByLabelText("scaleBar", { exact: true })).toBeVisible();
    const menu = await mapMenu(page);
    await menu.getByText("Scale Bar", { exact: true }).click();
    await expect.poll(() => page.getByLabelText("scaleBar", { exact: true }).length).toBe(0);
    await mission.open();
    await expect.element(page.getByTestId("map-menu-launcher")).toBeVisible();
    await expect.poll(() => page.getByLabelText("scaleBar", { exact: true }).length).toBe(0);
    expect(await mission.read()).toEqual(before);
  });
});

test.describe("Traverse editing contracts", () => {
  for (const disposition of ["Finished", "Cancel"] as const) {
    test(`dragging an interior vertex then ${disposition} preserves endpoints and the intended path after remount`, async ({
      page,
      mission,
    }) => {
      const original = (await mission.read()).traverses[mission.ids.traverseA].path;
      await mission.open();
      await enablePlanningEditMode(page);
      await selectTraverse(page);
      await page.getByLabelText("Edit Path on Map", { exact: true }).click();
      await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
      const destination = await dragVertex(page, mission.ids.traverseA, 1);
      await expect
        .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
        .not.toEqual(original);
      const changed = (await mission.read()).traverses[mission.ids.traverseA].path;
      expect(changed[0]).toEqual(original[0]);
      expect(changed.at(-1)).toEqual(original.at(-1));

      await page.getByLabelText(disposition, { exact: true }).click();
      await expect
        .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
        .toEqual(
          disposition === "Cancel"
            ? original
            : [
                original[0],
                {
                  lat: expect.closeTo(destination.lat, 8),
                  lng: expect.closeTo(destination.lng, 8),
                },
                original.at(-1),
              ]
        );
      const expected = (await mission.read()).traverses[mission.ids.traverseA].path;
      await expect.element(page.getByLabelText("Edit Path on Map", { exact: true })).toBeVisible();
      await mission.open();
      await selectPlanningEva(page, "Survey Alpha");
      const feature = async () =>
        (await readMapFeatures()).find(
          (item) => item.id === mission.ids.traverseA && item.geometryType === "LineString"
        );
      await expect.poll(async () => (await feature())?.coordinates).toHaveLength(expected.length);
      expect((await mission.read()).traverses[mission.ids.traverseA].path).toEqual(expected);
    });
  }

  test("Reset Path removes intermediate vertices and retains its neighboring stations", async ({
    page,
    mission,
  }) => {
    await mission.open();
    await enablePlanningEditMode(page);
    await selectTraverse(page);
    await page.getByLabelText("Reset Path", { exact: true }).click();
    const endpoints = [
      { lat: 0.001, lng: 0.001 },
      { lat: 0.001, lng: 0.003 },
    ];
    await expect
      .poll(async () => (await mission.read()).traverses[mission.ids.traverseA].path)
      .toEqual(endpoints);
    await mission.open();
    expect((await mission.read()).traverses[mission.ids.traverseA].path).toEqual(endpoints);
    await selectPlanningEva(page, "Survey Alpha");
    await expect
      .poll(
        async () =>
          (await readMapFeatures()).find((item) => item.id === mission.ids.traverseA)?.coordinates
      )
      .toHaveLength(2);
  });

  test("traverse endpoints cannot be detached from their stations by dragging", async ({
    page,
    mission,
  }) => {
    const original = (await mission.read()).traverses[mission.ids.traverseA].path;
    await mission.open();
    await enablePlanningEditMode(page);
    await selectTraverse(page);
    await page.getByLabelText("Edit Path on Map", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await dragVertex(page, mission.ids.traverseA, 0);
    await page.getByLabelText("Finished", { exact: true }).click();
    await expect.element(page.getByLabelText("Edit Path on Map", { exact: true })).toBeVisible();
    await mission.open();
    expect((await mission.read()).traverses[mission.ids.traverseA].path).toEqual(original);
  });

  test("navigating out of an edit removes its map interaction", async ({ page, mission }) => {
    const original = (await mission.read()).traverses[mission.ids.traverseA].path;
    await mission.open();
    await enablePlanningEditMode(page);
    await selectTraverse(page);
    await page.getByLabelText("Edit Path on Map", { exact: true }).click();
    await expect.element(page.getByLabelText("Cancel", { exact: true })).toBeVisible();
    await selectPlanningStation(page, "Bravo station");
    await selectPlanningEva(page, "Survey Alpha");
    await dragVertex(page, mission.ids.traverseA, 1);
    await page
      .getByLabelText("evaList-item")
      .filter({ hasText: "Survey Alpha" })
      .getByText("Alpha to Bravo", { exact: true })
      .click();
    await expect.element(page.getByLabelText("Edit Path on Map", { exact: true })).toBeVisible();
    expect((await mission.read()).traverses[mission.ids.traverseA].path).toEqual(original);
  });
});
