import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import type Point from "ol/geom/Point";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

const MOON_RADIUS = 1737400;
const southLps = `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=${MOON_RADIUS} +b=${MOON_RADIUS} +units=m +no_defs`;
const FIXED_GRID_FILE = "grid-coordinates-known.json";
const KNOWN_POINT = { lat: -3.4256273976012914, lng: -17.462978266484328 };

function knownGrid(
  center: AEGISPoint,
  spacingDegrees = 0.01,
  rowsNorthToSouth = false,
  size = 5
): MissionGridPoint[][] {
  const middle = (size - 1) / 2;
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({
      id: row * size + col,
      index: { row, col },
      coordinates: {
        lat: center.lat + (rowsNorthToSouth ? middle - row : row - middle) * spacingDegrees,
        lng: center.lng + (col - middle) * spacingDegrees,
      },
      name: `Known-${row}-${col}`,
    }))
  );
}

async function configureProjection(
  mission: BehavioralMission,
  projection: "earth" | "lunar" | "mercator"
): Promise<AEGISPoint> {
  const point = projection === "lunar" ? { lat: -89, lng: -133 } : KNOWN_POINT;
  await mission.change((doc) => {
    doc.landerLocation = { ...point };
    doc.initialZoom = projection === "lunar" ? 12 : 15;
    doc.usingLGRSCoordinates = projection === "lunar";
    doc.planetRadius = projection === "lunar" ? MOON_RADIUS : 6371000;
    doc.gridRenderMode = projection === "lunar" ? "dynamic-lgrs" : "server-file";
    if (projection === "lunar") {
      doc.projIsCustom = true;
      doc.projEpsg = "EPSG:3857";
      doc.projProj4String = southLps;
      doc.projBoundsMinX = -400000;
      doc.projBoundsMinY = -400000;
      doc.projBoundsMaxX = 400000;
      doc.projBoundsMaxY = 400000;
      doc.projResZoomLevel = 0;
      doc.projResUnitsPerPixel = 10000;
    } else if (projection === "mercator") {
      doc.projIsCustom = true;
      doc.projEpsg = "EPSG:3857";
      doc.projProj4String = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +units=m +no_defs";
      doc.projResZoomLevel = 0;
      doc.projResUnitsPerPixel = 156543.033928;
      doc.projBoundsMinX = -20037508;
      doc.projBoundsMinY = -20037508;
      doc.projBoundsMaxX = 20037508;
      doc.projBoundsMaxY = 20037508;
    } else {
      doc.projIsCustom = false;
      doc.projEpsg = "EPSG:3857";
      doc.projProj4String = "+proj=merc +a=6378137 +b=6378137 +units=m +no_defs";
      doc.projBoundsMinX = -20000000;
      doc.projBoundsMinY = -20000000;
      doc.projBoundsMaxX = 20000000;
      doc.projBoundsMaxY = 20000000;
    }
    if (projection !== "lunar") {
      doc.serverFileGrid = {
        numRows: 5,
        numCols: 5,
        name: "Known Coordinate Grid",
        fileName: FIXED_GRID_FILE,
      };
    }
  });
  return point;
}

async function moveToMapCenter(page: Page): Promise<void> {
  const viewport = page.locator('[data-map-mode="editor"] .ol-viewport');
  await expect(viewport).toBeVisible();
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error("Editor map viewport has no bounds");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

async function enableMouseCoordinates(page: Page): Promise<void> {
  const coordinate = page.getByText(/^-?\d+\.\d{6}, -?\d+\.\d{6}$/);
  await moveToMapCenter(page);
  if (await coordinate.isVisible().catch(() => false)) return;
  const map = page.locator('[data-map-mode="editor"]');
  await map.locator('svg[data-icon="eye"]').first().click();
  await expect(map.getByText("Map Item Visibility", { exact: true })).toBeVisible();
  await map.getByText("Mouse Lat/Lon", { exact: true }).click();
  await moveToMapCenter(page);
}

test.afterEach(async ({ mission }) => {
  if (!process.env.STATIC_DIR) return;
  await rm(
    path.resolve(
      process.env.STATIC_DIR,
      "missionFiles",
      String(mission.id),
      "Data",
      FIXED_GRID_FILE
    ),
    { force: true }
  );
});

test("mouse coordinates show independent lat/lng order, precision and grid reference in three CRSs", async ({
  page,
  mission,
}) => {
  expect(process.env.STATIC_DIR).toBeTruthy();
  const dataDirectory = path.resolve(
    process.env.STATIC_DIR!,
    "missionFiles",
    String(mission.id),
    "Data"
  );
  await mkdir(dataDirectory, { recursive: true });

  for (const [index, projection] of (["earth", "lunar", "mercator"] as const).entries()) {
    if (index > 0) await page.goto("/");
    const point = await configureProjection(mission, projection);
    if (projection !== "lunar") {
      await writeFile(
        path.join(dataDirectory, FIXED_GRID_FILE),
        JSON.stringify(knownGrid(point)),
        "utf8"
      );
    }
    await page.goto(mission.url);
    await enableMouseCoordinates(page);
    const expectedCoordinate = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    await expect(page.getByText(expectedCoordinate, { exact: true })).toBeVisible();
    const expectedGrid =
      projection === "lunar"
        ? "AZM B95 D44"
        : projection === "mercator"
          ? "Known-2-1"
          : "Known-2-2";
    await expect(page.getByText(expectedGrid, { exact: true })).toBeVisible();
  }

  await rm(path.join(dataDirectory, FIXED_GRID_FILE), { force: true });
});

test("fixed-grid visibility, labels, style and preset scope match known CRS intersections", async ({
  page,
  mission,
}) => {
  expect(process.env.STATIC_DIR).toBeTruthy();
  const dataDirectory = path.resolve(
    process.env.STATIC_DIR!,
    "missionFiles",
    String(mission.id),
    "Data"
  );
  await mkdir(dataDirectory, { recursive: true });
  const grid = knownGrid({ lat: 0, lng: 0 }, 0.0005, true, 41);
  await writeFile(path.join(dataDirectory, FIXED_GRID_FILE), JSON.stringify(grid), "utf8");
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.projEpsg = "EPSG:3857";
    doc.landerLocation = { lat: 0, lng: 0 };
    doc.planetRadius = 6371000;
    doc.initialZoom = 18;
    doc.gridRenderMode = "server-file";
    doc.serverFileGrid = {
      numRows: grid.length,
      numCols: grid[0].length,
      name: "Known Coordinate Grid",
      fileName: FIXED_GRID_FILE,
    };
    for (const presetUuid of [mission.ids.presetA, mission.ids.presetB]) {
      doc.presets[presetUuid].mapGridControl.visible = false;
      doc.presets[presetUuid].mapGridControl.labelsVisible = false;
    }
  });

  await page.goto(mission.url);
  await enablePlanningEditMode(page);
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabel("grid_panel", { exact: true }).click();
  const gridToggles = page.locator('[class*="gridToggles"] input[type="checkbox"]');
  const showGrid = gridToggles.nth(0);
  const showLabels = gridToggles.nth(1);
  const sourceCounts = async () =>
    page.evaluate(() => {
      const map = window.__aegisMaps.find(
        (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
      )?.map;
      return [7, 8].map((zIndex) => {
        const layer = map
          ?.getLayers()
          .getArray()
          .find((candidate) => candidate.getZIndex() === zIndex) as
          VectorLayer<VectorSource> | undefined;
        return layer?.getSource()?.getFeatures().length ?? 0;
      });
    });
  await expect.poll(sourceCounts).toEqual([0, 0]);
  await showGrid.check();
  await expect.poll(sourceCounts).toEqual([expect.any(Number), 0]);
  expect((await sourceCounts())[0]).toBeGreaterThan(0);
  await expect
    .poll(async () => (await mission.read()).presets[mission.ids.presetA].mapGridControl.visible)
    .toBe(true);

  await showLabels.check();
  await expect
    .poll(
      async () => (await mission.read()).presets[mission.ids.presetA].mapGridControl.labelsVisible
    )
    .toBe(true);
  await page.locator('[data-map-mode="editor"] .ol-viewport').hover();
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await sourceCounts())[1]).toBeGreaterThan(0);
  const knownLabel = await page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    const layer = map
      ?.getLayers()
      .getArray()
      .find((candidate) => candidate.getZIndex() === 8) as VectorLayer<VectorSource> | undefined;
    const features = layer?.getSource()?.getFeatures() ?? [];
    const feature = features.find((item) => {
      const featureStyle = item.getStyle();
      if (!featureStyle || typeof featureStyle === "function") return false;
      const style = Array.isArray(featureStyle) ? featureStyle[0] : featureStyle;
      return style?.getText()?.getText() === "Known-20-20";
    });
    const featureStyle = feature?.getStyle();
    const style =
      featureStyle && typeof featureStyle !== "function"
        ? Array.isArray(featureStyle)
          ? featureStyle[0]
          : featureStyle
        : undefined;
    const text = style?.getText();
    const geometry = feature?.getGeometry();
    const coordinates = geometry?.getType() === "Point" ? (geometry as Point).getCoordinates() : [];
    const stroke = text?.getStroke();
    return {
      text: text?.getText(),
      coordinates,
      labelColor: text?.getFill()?.getColor(),
      haloWidth: stroke?.getWidth(),
    };
  });
  expect(knownLabel.text).toBe("Known-20-20");
  expect(knownLabel.coordinates[0]).toBeCloseTo(0, 8);
  expect(knownLabel.coordinates[1]).toBeCloseTo(0, 8);
  expect(knownLabel.labelColor).toBeTruthy();
  expect(knownLabel.haloWidth).toBeGreaterThan(0);

  const initialOpacity = (await mission.read()).presets[mission.ids.presetA].mapGridControl.style
    .opacity;
  const opacity = page.locator('[class*="slidersContainer"]').getByRole("slider").first();
  await opacity.press("ArrowLeft");
  await expect
    .poll(
      async () => (await mission.read()).presets[mission.ids.presetA].mapGridControl.style.opacity
    )
    .not.toBe(initialOpacity);
  const savedGridStyle = (await mission.read()).presets[mission.ids.presetA].mapGridControl.style;
  expect(savedGridStyle.opacity).toBeLessThan(initialOpacity);

  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Detail" })
    .getByText("Detail", { exact: true })
    .click();
  await expect.poll(sourceCounts).toEqual([0, 0]);
  await page.reload();
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabel("preset Section", { exact: true }).click();
  await page.getByLabel("grid_panel", { exact: true }).click();
  await expect(
    page.getByText("Grid Visibility:", { exact: true }).locator("..").locator("..")
  ).toContainText("Visible");
  await expect(
    page.getByText("Grid Label Visibility:", { exact: true }).locator("..").locator("..")
  ).toContainText("Visible");
  expect((await mission.read()).presets[mission.ids.presetA].mapGridControl.style.opacity).toBe(
    savedGridStyle.opacity
  );

  await rm(path.join(dataDirectory, FIXED_GRID_FILE), { force: true });
});
