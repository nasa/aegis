import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type Point from "ol/geom/Point";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode } from "./planningHelpers";

const FIXED_GRID_FILE = "grid-coordinates-known.json";

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

test("served fixed-grid intersections and saved opacity reconstruct after a fresh server load", async ({
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
      doc.presets[presetUuid].mapGridControl.visible = true;
      doc.presets[presetUuid].mapGridControl.labelsVisible = true;
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
