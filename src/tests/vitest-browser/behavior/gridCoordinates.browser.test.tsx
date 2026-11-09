import { commands, userEvent } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import type Point from "ol/geom/Point";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { test, expect } from "./missionHarness";
import { isVisible, setChecked } from "./browserAssertions";
import { enablePlanningEditMode } from "./planningHelpers";
import { waitForMapIdle } from "./mapInteractions";
import { readMapFeatures } from "./mapObserver";

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
  mission: BrowserMission,
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
  const viewport = page.getBySelector('[data-map-mode="editor"] .ol-viewport');
  await expect.element(viewport).toBeVisible();
  await waitForMapIdle();
  const bounds = viewport.element().getBoundingClientRect();
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await commands.mapPointer("move", x + 8, y + 8);
  await commands.mapPointer("move", x, y);
}

async function enableMouseCoordinates(page: Page): Promise<void> {
  const coordinate = page.getByText(/^-?\d+\.\d{6}, -?\d+\.\d{6}$/);
  await moveToMapCenter(page);
  if (isVisible(coordinate)) return;
  const map = page.getBySelector('[data-map-mode="editor"]');
  await map.getBySelector('svg[data-icon="eye"]').first().click();
  await expect.element(map.getByText("Map Item Visibility", { exact: true })).toBeVisible();
  await map.getByText("Mouse Lat/Lon", { exact: true }).click();
  await moveToMapCenter(page);
}

for (const projection of ["earth", "lunar", "mercator"] as const) {
  test(`mouse coordinates show independent lat/lng order, precision and grid reference in ${projection} CRS`, async ({
    page,
    mission,
    requestHandlers,
  }) => {
    const point = await configureProjection(mission, projection);
    if (projection !== "lunar") {
      requestHandlers["/api/v1/grid"] = () =>
        Response.json({
          status: "success",
          data: { coordinates: knownGrid({ lat: point.lat + 0.002, lng: point.lng - 0.002 }) },
        });
    }
    await mission.open();
    await enableMouseCoordinates(page);
    const expectedCoordinate = `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`;
    // Dockview can resize the map after its first pointer sample; read a fresh native center sample.
    await expect
      .poll(async () => {
        await moveToMapCenter(page);
        return isVisible(page.getByText(expectedCoordinate, { exact: true }));
      })
      .toBe(true);
    // Both fixed-grid projections sample the interior of the same known cell.
    const expectedGrid = projection === "lunar" ? "AZM B95 D44" : "Known-2-2";
    await expect.element(page.getByText(expectedGrid, { exact: true })).toBeVisible();
  });
}

test("equatorial lunar coordinates and dynamic LTM grid survive preset toggles and remount", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.projEpsg = "EPSG:3857";
    doc.planetRadius = MOON_RADIUS;
    doc.landerLocation = { lat: -0.0001, lng: 0.0001 };
    doc.initialZoom = 14;
    doc.usingLGRSCoordinates = true;
    doc.gridRenderMode = "dynamic-lgrs";
    doc.presets[mission.ids.presetA].mapGridControl.visible = false;
    doc.presets[mission.ids.presetA].mapGridControl.labelsVisible = false;
  });
  await mission.open();
  await enableMouseCoordinates(page);
  await expect
    .poll(async () => {
      await moveToMapCenter(page);
      return isVisible(page.getByText("-0.000100, 0.000100", { exact: true }));
    })
    .toBe(true);
  // Independent 10 m example from the LGRS reference table, across the equator in band M.
  await expect.element(page.getByText("23MFE -00 Z99", { exact: true })).toBeVisible();

  await enablePlanningEditMode(page);
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabelText("grid_panel", { exact: true }).click();
  await expect.element(page.getByText("LGRS dynamically generated", { exact: true })).toBeVisible();
  const toggles = page.getBySelector('[class*="gridToggles"] input[type="checkbox"]');
  const gridFeatures = () => readMapFeatures().filter((feature) => feature.layerZIndex === 7);
  const labelFeatures = () => readMapFeatures().filter((feature) => feature.layerZIndex === 8);
  const paintedPixels = () =>
    Array.from(
      document.querySelectorAll<HTMLCanvasElement>('[data-map-mode="editor"] .ol-viewport canvas')
    ).reduce((total, canvas) => {
      const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
      return total + (data?.filter((alpha, index) => index % 4 === 3 && alpha > 0).length ?? 0);
    }, 0);
  await expect.poll(() => gridFeatures().length).toBe(0);
  await waitForMapIdle();
  const withoutGrid = paintedPixels();
  await setChecked(toggles.nth(0), true);
  await expect.poll(() => gridFeatures().length).toBeGreaterThan(0);
  expect(gridFeatures().every((feature) => feature.geometryType === "LineString")).toBe(true);
  await expect.poll(paintedPixels).toBeGreaterThan(withoutGrid + 1000);
  await expect.poll(() => labelFeatures().length).toBe(0);
  await setChecked(toggles.nth(1), true);
  await expect.poll(() => labelFeatures().length).toBeGreaterThan(0);
  await setChecked(toggles.nth(0), false);
  await expect.poll(() => gridFeatures().length + labelFeatures().length).toBe(0);
  expect((await mission.read()).presets[mission.ids.presetA].mapGridControl.labelsVisible).toBe(
    false
  );
  await expect.poll(paintedPixels).toBeLessThan(withoutGrid + 1000);
  await setChecked(toggles.nth(0), true);
  await expect.poll(() => labelFeatures().length).toBe(0);
  await setChecked(toggles.nth(1), true);

  const before = await mission.read();
  await mission.open();
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await expect.poll(() => gridFeatures().length).toBeGreaterThan(0);
  await expect.poll(() => labelFeatures().length).toBeGreaterThan(0);
  expect(await mission.read()).toEqual(before);
});

test("fixed-grid visibility, labels, style and preset scope match known CRS intersections", async ({
  page,
  mission,
  requestHandlers,
}) => {
  const grid = knownGrid({ lat: 0, lng: 0 }, 0.0005, true, 41);
  requestHandlers["/api/v1/grid"] = () =>
    Response.json({ status: "success", data: { coordinates: grid } });
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

  await mission.open();
  await enablePlanningEditMode(page);
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabelText("grid_panel", { exact: true }).click();
  const gridToggles = page.getBySelector('[class*="gridToggles"] input[type="checkbox"]');
  const showGrid = gridToggles.nth(0);
  const showLabels = gridToggles.nth(1);
  const sourceCounts = async () =>
    (() => {
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
    })();
  await expect.poll(sourceCounts).toEqual([0, 0]);
  await setChecked(showGrid, true);
  await expect.poll(sourceCounts).toEqual([expect.any(Number), 0]);
  expect((await sourceCounts())[0]).toBeGreaterThan(0);
  await expect
    .poll(async () => (await mission.read()).presets[mission.ids.presetA].mapGridControl.visible)
    .toBe(true);

  await setChecked(showLabels, true);
  await expect
    .poll(
      async () => (await mission.read()).presets[mission.ids.presetA].mapGridControl.labelsVisible
    )
    .toBe(true);
  await page.getBySelector('[data-map-mode="editor"] .ol-viewport').hover();
  await commands.mapPointer("wheel", 0, -120);
  await expect.poll(async () => (await sourceCounts())[1]).toBeGreaterThan(0);
  const knownLabel = await (() => {
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
  })();
  expect(knownLabel.text).toBe("Known-20-20");
  expect(knownLabel.coordinates[0]).toBeCloseTo(0, 8);
  expect(knownLabel.coordinates[1]).toBeCloseTo(0, 8);
  expect(knownLabel.labelColor).toBeTruthy();
  expect(knownLabel.haloWidth).toBeGreaterThan(0);

  const initialOpacity = (await mission.read()).presets[mission.ids.presetA].mapGridControl.style
    .opacity;
  const opacity = page.getBySelector('[class*="slidersContainer"]').getByRole("slider").first();
  opacity.element().focus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect
    .poll(
      async () => (await mission.read()).presets[mission.ids.presetA].mapGridControl.style.opacity
    )
    .not.toBe(initialOpacity);
  const savedGridStyle = (await mission.read()).presets[mission.ids.presetA].mapGridControl.style;
  expect(savedGridStyle.opacity).toBeLessThan(initialOpacity);

  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Detail" })
    .getByText("Detail", { exact: true })
    .click();
  await expect.poll(sourceCounts).toEqual([0, 0]);
  await mission.open();
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page.getByLabelText("grid_panel", { exact: true }).click();
  await expect
    .element(
      page.getByText("Grid Visibility:", { exact: true }).getBySelector("..").getBySelector("..")
    )
    .toMatchTextContent("Visible");
  await expect
    .element(
      page
        .getByText("Grid Label Visibility:", { exact: true })
        .getBySelector("..")
        .getBySelector("..")
    )
    .toMatchTextContent("Visible");
  expect((await mission.read()).presets[mission.ids.presetA].mapGridControl.style.opacity).toBe(
    savedGridStyle.opacity
  );
});
