import { test, expect } from "../fixtures/behavioralTest";
import { readMapFeatures } from "../fixtures/mapAssertions";
import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type Style from "ol/style/Style";

test.use({ scenario: "execution" });

const MOON_RADIUS = 1737400;
const southLps = `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=${MOON_RADIUS} +b=${MOON_RADIUS} +units=m +no_defs`;

async function openVisibilityMenu(page: Page): Promise<void> {
  const map = page.locator('[data-map-mode="dashboard"]');
  await map.hover();
  await map.locator('svg[data-icon="eye"]').first().click();
  await expect(map.getByText("Map Item Visibility", { exact: true })).toBeVisible();
}

async function dashboardViewport(page: Page) {
  return page.evaluate(() => {
    const observed = window.__aegisMaps.find(
      (entry) => entry.mode === "dashboard" && entry.map.getTargetElement()?.isConnected
    );
    const map = observed?.map;
    if (!map) throw new Error("Dashboard map is not observed");
    const extent = map.getView().calculateExtent(map.getSize());
    return { extent, size: map.getSize() };
  });
}

async function minimapBounds(page: Page) {
  return page.evaluate(() => {
    const observed = window.__aegisMaps.find(
      (entry) => entry.mode === "minimap" && entry.map.getTargetElement()?.isConnected
    );
    if (!observed) throw new Error("Minimap is not observed");
    for (const layer of observed.map.getLayers().getArray()) {
      const source = (layer as VectorLayer).getSource?.();
      const feature = source?.getFeatureById?.("big-map-bounds");
      const geometry = feature?.getGeometry();
      if (geometry) return geometry.getExtent();
    }
    return null;
  });
}

async function arrowImageCounts(page: Page) {
  return page.evaluate(() => {
    return (["dashboard", "minimap"] as const).map((mode) => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
      )?.map;
      if (!map) return { mode, count: 0 };
      const layer = map
        .getLayers()
        .getArray()
        .find((candidate) => candidate.getZIndex() === 10);
      const source = (layer as VectorLayer | undefined)?.getSource?.();
      const styleFunction = (layer as VectorLayer | undefined)?.getStyleFunction();
      if (!source || !styleFunction) return { mode, count: 0, features: 0, styled: false };
      const features = source
        .getFeatures()
        .filter((feature) => feature.getGeometry()?.getType() === "LineString");
      const styles = features.flatMap((feature) =>
        styleFunction(feature, map.getView().getResolution() ?? 1)
      );
      return {
        mode,
        count: styles.filter((style): style is Style => !!style && !!style.getImage()).length,
        features: features.length,
        styled: true,
      };
    });
  });
}

async function expectBoundsFollowDashboard(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const viewport = await dashboardViewport(page);
      const bounds = (await minimapBounds(page)) as [number, number, number, number] | null;
      if (!bounds) return null;
      return bounds.map((coordinate: number, index: number) =>
        Math.abs(coordinate - viewport.extent[index])
      );
    })
    .toEqual([0, 0, 0, 0]);
}

test("dashboard minimap bounds, arrows, scale, grid spacing and execution stay bridged", async ({
  page,
  mission,
}) => {
  // A real, deterministic south-LPS mission makes grid rendering independent
  // of an uploaded server grid. The dashboard and minimap still use production
  // projections, map sources, layers, and menu controls.
  await mission.change((doc) => {
    doc.gridRenderMode = "dynamic-lgrs";
    doc.projIsCustom = true;
    doc.projEpsg = "EPSG:3857";
    doc.projProj4String = southLps;
    doc.projResUnitsPerPixel = 10000;
    doc.projResZoomLevel = 0;
    doc.projBoundsMinX = -400000;
    doc.projBoundsMinY = -400000;
    doc.projBoundsMaxX = 400000;
    doc.projBoundsMaxY = 400000;
    doc.initialZoom = 12;
    doc.presets[mission.ids.presetA].mapGridControl.visible = true;
    doc.presets[mission.ids.presetA].mapGridControl.labelsVisible = false;

    const locations: AEGISPoint[] = [
      { lat: -89.96, lng: 0 },
      { lat: -89.95, lng: 0.1 },
      { lat: -89.94, lng: 0.2 },
      { lat: -89.93, lng: 0.3 },
      { lat: -89.92, lng: 0.4 },
    ];
    doc.landerLocation = { ...locations[0] };
    for (const [index, station] of Object.values(doc.stations).entries()) {
      const location = locations[index % locations.length];
      station.location = { ...location };
      station.walkbackPath = [{ ...locations[0] }, { ...location }];
    }
    for (const [index, traverse] of Object.values(doc.traverses).entries()) {
      traverse.path = [
        { ...locations[index % locations.length] },
        { ...locations[(index + 2) % locations.length] },
      ];
    }
    for (const [index, action] of Object.values(doc.actions).entries()) {
      action.location = { ...locations[index % locations.length] };
    }
    for (const rex of Object.values(doc.rexes)) {
      for (const [index, entry] of rex.posEntries.entries()) {
        entry.location = { ...locations[(index + 1) % locations.length] };
      }
    }
  });

  await page.goto(mission.dashboardUrl);
  await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+00:05:00");
  await expect(page.locator('[data-map-mode="dashboard"] .ol-viewport')).toBeVisible();
  await expect(page.locator('[data-map-mode="minimap"] .ol-viewport')).toBeVisible();
  await expectBoundsFollowDashboard(page);

  const gridCounts = async () =>
    Promise.all(
      (["dashboard", "minimap"] as const).map(
        async (mode) =>
          (await readMapFeatures(page, mode)).filter((feature) => feature.layerZIndex === 7).length
      )
    );
  await expect.poll(gridCounts).toEqual([expect.any(Number), expect.any(Number)]);
  expect((await gridCounts()).every((count) => count > 0)).toBe(true);

  const dashboardMap = page.locator('[data-map-mode="dashboard"]');
  const startViewport = await dashboardViewport(page);
  await dashboardMap.hover();
  const mapBox = await dashboardMap.boundingBox();
  if (!mapBox) throw new Error("Dashboard map has no layout box");
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await page.mouse.wheel(0, -350);
  await expect
    .poll(async () => (await dashboardViewport(page)).extent)
    .not.toEqual(startViewport.extent);
  await expectBoundsFollowDashboard(page);
  const afterZoom = await dashboardViewport(page);

  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width / 2 + 90, mapBox.y + mapBox.height / 2 + 55, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await dashboardViewport(page)).extent)
    .not.toEqual(afterZoom.extent);
  await expectBoundsFollowDashboard(page);

  const boundsBeforeResize = await minimapBounds(page);
  const dashboardSizeBeforeResize = (await dashboardViewport(page)).size;
  await page.setViewportSize({ width: 1500, height: 900 });
  await expect
    .poll(async () => (await dashboardViewport(page)).size)
    .not.toEqual(dashboardSizeBeforeResize);
  await expectBoundsFollowDashboard(page);
  expect(await minimapBounds(page)).not.toEqual(boundsBeforeResize);

  await openVisibilityMenu(page);
  const visibilityMenu = dashboardMap
    .getByText("Map Item Visibility", { exact: true })
    .locator("..");
  const scaleToggle = dashboardMap.getByText("Scale Bar", { exact: true });
  await expect(
    page.locator('[data-map-mode="dashboard"]').getByLabel("scaleBar", { exact: true })
  ).toBeVisible();
  await expect(
    page.locator('[data-map-mode="minimap"]').getByLabel("scaleBar", { exact: true })
  ).toBeVisible();

  const autoGridCounts = await gridCounts();
  await dashboardMap.getByText("1km", { exact: true }).first().click();
  await expect
    .poll(async () => {
      const counts = await gridCounts();
      return counts.every((count, index) => count > 0 && count < autoGridCounts[index]);
    })
    .toBe(true);

  const arrowRow = dashboardMap
    .locator('[class*="toggleMenuItemRow"]')
    .filter({ hasText: "Traverse" });
  const arrowsToggle = arrowRow.getByText("Arrows", { exact: true });
  await expect
    .poll(async () => (await arrowImageCounts(page)).map((entry) => entry.count))
    .toEqual([expect.any(Number), expect.any(Number)]);
  const initialArrowCounts = await arrowImageCounts(page);
  expect(
    initialArrowCounts.every((entry) => entry.count > 0),
    JSON.stringify(initialArrowCounts)
  ).toBe(true);
  await arrowsToggle.click();
  await expect
    .poll(async () => (await arrowImageCounts(page)).map((entry) => entry.count))
    .toEqual([0, 0]);
  await arrowsToggle.click();
  await expect
    .poll(async () => (await arrowImageCounts(page)).every((entry) => entry.count > 0))
    .toBe(true);

  await scaleToggle.click();
  await expect(
    page.locator('[data-map-mode="dashboard"]').getByLabel("scaleBar", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.locator('[data-map-mode="minimap"]').getByLabel("scaleBar", { exact: true })
  ).toHaveCount(0);
  await scaleToggle.click();
  await expect(
    page.locator('[data-map-mode="dashboard"]').getByLabel("scaleBar", { exact: true })
  ).toBeVisible();
  await expect(
    page.locator('[data-map-mode="minimap"]').getByLabel("scaleBar", { exact: true })
  ).toBeVisible();
  await expect(visibilityMenu).toBeVisible();

  const minimapTraverseIds = async () =>
    (await readMapFeatures(page, "minimap"))
      .filter((feature) => feature.layerZIndex === 10 && feature.visible)
      .map((feature) => feature.id)
      .sort();
  await expect
    .poll(minimapTraverseIds)
    .toEqual([mission.ids.rexTraverseB, mission.ids.rexTraverseBReturn]);
  await mission.change((doc) => {
    doc.rexes[mission.ids.rexB].isRunning = false;
    doc.rexes[mission.ids.rexA].isRunning = true;
  });
  await expect(page.getByTestId("dashboard-pet-clock")).toHaveText("+02:10:05");
  await expect
    .poll(async () =>
      (await readMapFeatures(page, "minimap"))
        .filter((feature) => feature.layerZIndex === 14 && feature.visible)
        .map((feature) => feature.id)
        .sort()
    )
    .toEqual([mission.ids.rexStationA, mission.ids.rexStationABravo]);
  await expect
    .poll(minimapTraverseIds)
    .toEqual([
      mission.ids.rexTraverseOutbound,
      mission.ids.rexTraverseA,
      mission.ids.rexTraverseReturn,
    ]);
  await expectBoundsFollowDashboard(page);
  expect((await gridCounts()).every((count) => count > 0)).toBe(true);
  expect((await arrowImageCounts(page)).every((entry) => entry.count > 0)).toBe(true);
});
