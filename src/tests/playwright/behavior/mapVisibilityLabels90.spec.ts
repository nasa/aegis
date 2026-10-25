import type { Page } from "@playwright/test";
import type Point from "ol/geom/Point";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type Style from "ol/style/Style";
import { test, expect } from "../fixtures/behavioralTest";
import { readMapFeatures } from "../fixtures/mapAssertions";
import { seedAction, seedPoi } from "../fixtures/entitySeeds";
import { selectPlanningEva, selectPlanningPoi, selectPlanningStation } from "./planningHelpers";

const DISABLED_ACTION = "30000000-0000-4000-8000-000000091501";
const UNLOCATED_POI = "30000000-0000-4000-8000-000000091502";
const UNLOCATED_ACTION = "30000000-0000-4000-8000-000000091503";
const CIRCLE = "30000000-0000-4000-8000-000000091504";

async function openMapMenu(page: Page) {
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  await expect(menu).toBeVisible();
  return menu;
}

async function closeMapMenu(page: Page): Promise<void> {
  await page.getByTestId("map-menu-floating-panel").locator('svg[data-icon="xmark"]').click();
}

async function toggleEye(page: Page, category: string): Promise<void> {
  const menu = await openMapMenu(page);
  await menu
    .getByText(category, { exact: true })
    .locator("..")
    .locator('svg[data-icon="eye"]')
    .click();
  await closeMapMenu(page);
}

async function toggleCategoryOption(page: Page, label: string): Promise<void> {
  const menu = await openMapMenu(page);
  await menu.getByText(label, { exact: true }).click();
  await closeMapMenu(page);
}

async function idsAtZIndex(page: Page, zIndex: number): Promise<string[]> {
  return (await readMapFeatures(page))
    .filter((feature) => feature.layerZIndex === zIndex && feature.visible)
    .map((feature) => feature.id)
    .sort();
}

async function labelRenderState(page: Page, labelIds: string[]) {
  return page.evaluate((labelIds) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) throw new Error("The editor map is not observed");
    const layer = map
      .getLayers()
      .getArray()
      .find((candidate) => candidate.getZIndex() === 21) as VectorLayer<VectorSource> | undefined;
    const source = layer?.getSource();
    const styleFunction = layer?.getStyleFunction();
    if (!source || !styleFunction) throw new Error("The marker label layer is not ready");
    return labelIds.flatMap((id) => {
      const feature = source.getFeatureById(id);
      const geometry = feature?.getGeometry();
      if (!feature || !geometry) return [];
      if (geometry.getType() !== "Point") return [];
      const pointGeometry = geometry as Point;
      const resolution = map.getView().getResolution() ?? 1;
      const styles = styleFunction(feature, resolution);
      const imageStyle = (Array.isArray(styles) ? styles : [styles])
        .filter((style): style is Style => typeof style === "object" && !!style.getImage())
        .at(-1);
      const icon = imageStyle?.getImage();
      const image = icon?.getImage(1);
      let raster = { width: 0, height: 0, opaquePixels: 0, brightPixels: 0 };
      if (image instanceof HTMLCanvasElement) {
        const ctx = image.getContext("2d");
        if (ctx) {
          const { width, height } = image;
          const pixels = ctx.getImageData(0, 0, width, height).data;
          let opaquePixels = 0;
          let brightPixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] > 0) opaquePixels++;
            if (pixels[i + 3] > 128 && pixels[i] > 120 && pixels[i + 1] > 150) brightPixels++;
          }
          raster = { width, height, opaquePixels, brightPixels };
        }
      }
      return [
        {
          id,
          name: feature.get("name"),
          labelType: feature.get("labelType"),
          opacity: feature.get("labelOpacity"),
          iconOpacity: icon?.getOpacity(),
          anchorCoord: feature.get("anchorCoord"),
          labelCoord: pointGeometry.getCoordinates(),
          raster,
        },
      ];
    });
  }, labelIds);
}

function projected(point: { lat: number; lng: number }): [number, number] {
  return [
    (point.lng * Math.PI * 6378137) / 180,
    Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
  ];
}

async function layoutPixels(page: Page, labelId: string) {
  return page.evaluate((labelId) => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) throw new Error("The editor map is not observed");
    const layer = map
      .getLayers()
      .getArray()
      .find((candidate) => candidate.getZIndex() === 21) as VectorLayer<VectorSource> | undefined;
    const feature = layer?.getSource()?.getFeatureById(labelId);
    const geometry = feature?.getGeometry();
    const anchor = feature?.get("anchorCoord") as [number, number] | undefined;
    if (!geometry || !anchor) return null;
    if (geometry.getType() !== "Point") return null;
    const pointGeometry = geometry as Point;
    const anchorPixel = map.getPixelFromCoordinate(anchor);
    const labelPixel = map.getPixelFromCoordinate(pointGeometry.getCoordinates());
    const styles = layer?.getStyleFunction()?.(feature, map.getView().getResolution() ?? 1);
    const imageStyle = (Array.isArray(styles) ? styles : [styles])
      .filter((style): style is Style => typeof style === "object" && !!style.getImage())
      .at(-1);
    const icon = imageStyle?.getImage();
    const image = icon?.getImage(1);
    const boxWidth = image instanceof HTMLCanvasElement ? image.width / window.devicePixelRatio : 0;
    return {
      anchorPixel,
      labelPixel,
      boxWidth,
      viewport: map.getSize(),
    };
  }, labelId);
}

test("planned and selected entity visibility follows location, enabled state, parent scope and toggles", async ({
  page,
  mission,
}) => {
  const actionTemplate = (await mission.read()).actions[mission.ids.actionA];
  await mission.change((doc) => {
    doc.stations[mission.ids.stationB].location = null;
    doc.stations[mission.ids.stationB].walkbackPath = null;
    doc.pois[UNLOCATED_POI] = seedPoi({ uuid: UNLOCATED_POI, name: "Unlocated POI" });
    doc.actions[DISABLED_ACTION] = seedAction({
      ...actionTemplate,
      uuid: DISABLED_ACTION,
      refUuid: "40000000-0000-4000-8000-000000091501",
      name: "Disabled action",
      enabled: false,
      location: { lat: 0.0015, lng: 0.002 },
    });
    doc.actions[UNLOCATED_ACTION] = seedAction({
      ...actionTemplate,
      uuid: UNLOCATED_ACTION,
      refUuid: "40000000-0000-4000-8000-000000091503",
      name: "Unlocated action",
      enabled: true,
      location: null,
    });
    doc.stations[mission.ids.stationA].actionOrderUuids = [
      ...doc.stations[mission.ids.stationA].actionOrderUuids,
      DISABLED_ACTION,
      UNLOCATED_ACTION,
    ];
    doc.circleDefinitions[CIRCLE] = { name: "Map visibility ring", radius: 120 };
    doc.stations[mission.ids.stationA].mapCircleControls[CIRCLE] = {
      uuid: CIRCLE,
      visible: true,
      style: {
        opacity: 1,
        contrast: 1,
        brightness: 1,
        saturation: 1,
        blendMode: "normal",
        color: "#FFFFFF",
        weight: 1,
        fillColor: "none",
        fillOpacity: 0,
        isDashed: false,
        dashLen: 10,
        altColor: "#FFFFFF",
        altOpacity: 1,
        showLabels: true,
        labelColor: "#ffffff",
        labelHaloColor: "#000000",
        labelHaloWidth: 2,
        labelHaloOpacity: 0.2,
      },
    };
  });
  expect((await mission.read()).actions[DISABLED_ACTION]).toMatchObject({
    enabled: false,
    name: "Disabled action",
  });

  await mission.open(page);
  await expect.poll(() => idsAtZIndex(page, 14)).toEqual([mission.ids.stationA]);
  await expect.poll(() => idsAtZIndex(page, 15)).toEqual([mission.ids.poiA]);
  await expect.poll(() => idsAtZIndex(page, 12)).toEqual([]);

  await selectPlanningStation(page, "Alpha station");
  await expect.poll(() => idsAtZIndex(page, 12)).toEqual([mission.ids.actionA]);
  await expect.poll(() => idsAtZIndex(page, 10)).toContain(`walkback-${mission.ids.stationA}`);
  await expect.poll(() => idsAtZIndex(page, 6)).toHaveLength(1);

  await toggleCategoryOption(page, "Walkbacks");
  await expect.poll(() => idsAtZIndex(page, 10)).not.toContain(`walkback-${mission.ids.stationA}`);
  await toggleCategoryOption(page, "Walkbacks");
  await toggleCategoryOption(page, "Circles");
  await expect.poll(() => idsAtZIndex(page, 6)).toHaveLength(0);
  await toggleCategoryOption(page, "Circles");

  await selectPlanningStation(page, "Bravo station");
  await expect.poll(() => idsAtZIndex(page, 12)).toEqual([]);
  await toggleEye(page, "Stations");
  await expect.poll(() => idsAtZIndex(page, 14)).toEqual([]);
  await selectPlanningStation(page, "Alpha station");
  await expect.poll(() => idsAtZIndex(page, 14)).toEqual([mission.ids.stationA]);
  await selectPlanningEva(page, "Survey Alpha");
  await expect.poll(() => idsAtZIndex(page, 14)).toEqual([mission.ids.stationA]);

  await toggleEye(page, "POIs");
  await expect.poll(() => idsAtZIndex(page, 15)).toEqual([]);
  await selectPlanningPoi(page, "Reference POI");
  await expect.poll(() => idsAtZIndex(page, 15)).toEqual([mission.ids.poiA]);
  expect((await mission.read()).pois[UNLOCATED_POI].location).toBeNull();
  expect((await mission.read()).actions[DISABLED_ACTION].enabled).toBe(false);
});

test("colliding long and multiline labels keep exact text, priority, fixed offset and readable rendered ink across zooms", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.stations[mission.ids.stationA].name =
      "Alpha station — a deliberately long marker label near the viewport edge";
    doc.stations[mission.ids.stationA].location = { lat: 0.0015, lng: 0.002 };
    doc.pois[mission.ids.poiA].name = "Reference POI\nSecond line stays readable";
    doc.pois[mission.ids.poiA].location = { lat: 0.0015, lng: 0.002 };
    doc.actions[mission.ids.actionA].name = "Sample regolith — action label";
    doc.actions[mission.ids.actionA].location = { lat: 0.0015, lng: 0.002 };
  });
  await mission.open(page);
  await selectPlanningStation(
    page,
    "Alpha station — a deliberately long marker label near the viewport edge"
  );
  const menu = await openMapMenu(page);
  for (const category of ["Stations", "POIs", "Actions"]) {
    await menu
      .getByText(category, { exact: true })
      .locator("..")
      .getByText("Labels", { exact: true })
      .click();
  }
  await closeMapMenu(page);

  const labelIds = [
    `station-${mission.ids.stationA}`,
    `poi-${mission.ids.poiA}`,
    `action-${mission.ids.actionA}`,
  ];
  const expectedNames = [
    "Alpha station — a deliberately long marker label near the viewport edge",
    "Reference POI\nSecond line stays readable",
    "Sample regolith — action label",
  ];
  const labelInfos = async () => {
    const labels = await readMapFeatures(page);
    return labelIds.map((id) => labels.find((feature) => feature.id === id));
  };
  await expect.poll(labelInfos).toMatchObject(
    labelIds.map((id, index) => ({
      id,
      name: expectedNames[index],
      geometryType: "Point",
      labelType: id.split("-")[0],
      visible: true,
    }))
  );

  const style = await labelRenderState(page, labelIds);
  const stationPoint = (await mission.read()).stations[mission.ids.stationA].location!;
  expect(style[0].anchorCoord).toEqual(projected(stationPoint));
  expect(style.map((label) => label.name)).toEqual(expectedNames);
  expect(style[0].opacity).toBe(1);
  expect(style[1].opacity).toBeGreaterThan(0.2);
  expect(style[1].opacity).toBeLessThan(1);
  expect(style[2].opacity).toBeLessThan(style[1].opacity);
  expect(style.map((label) => label.raster.brightPixels).every((pixels) => pixels > 10)).toBe(true);
  expect(style[0].raster.width).toBeGreaterThan(style[2].raster.width * 1.5);
  expect(style[1].raster.height).toBeGreaterThan(style[2].raster.height);

  for (const zoom of [12, 16, 19]) {
    await page.evaluate((nextZoom) => {
      window.__aegisMaps
        .find((entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected)
        ?.map.getView()
        .setZoom(nextZoom);
    }, zoom);
    const layout = await layoutPixels(page, labelIds[0]);
    expect(layout).not.toBeNull();
    expect(layout!.labelPixel[0]).toBeCloseTo(layout!.anchorPixel[0], 1);
    expect(layout!.labelPixel[1] - layout!.anchorPixel[1]).toBeCloseTo(-28, 1);

    if (zoom === 19) {
      await page.evaluate((labelId) => {
        const map = window.__aegisMaps.find(
          (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
        )!.map;
        const labelLayer = map
          .getLayers()
          .getArray()
          .find((layer) => layer.getZIndex() === 21) as VectorLayer<VectorSource> | undefined;
        if (!labelLayer) throw new Error("The marker label layer is not ready");
        const feature = labelLayer.getSource()?.getFeatureById(labelId);
        if (!feature) throw new Error("The marker label feature is not ready");
        const anchor = feature.get("anchorCoord") as [number, number];
        const size = map.getSize()!;
        const resolution = map.getView().getResolution()!;
        const styleFunction = labelLayer.getStyleFunction();
        if (!styleFunction) throw new Error("The marker label style is not ready");
        const styled = styleFunction(feature, resolution);
        const style = Array.isArray(styled) ? styled : styled ? [styled] : [];
        const icon = style
          .filter((entry): entry is Style => typeof entry === "object" && !!entry.getImage())
          .at(-1)!
          .getImage()!;
        const image = icon.getImage(1) as HTMLCanvasElement;
        const targetX = size[0] - image.width / window.devicePixelRatio / 2 - 2;
        const anchorPixel = map.getPixelFromCoordinate(anchor)!;
        const oldCoordinateAtTarget = map.getCoordinateFromPixel([targetX, anchorPixel[1]])!;
        const center = map.getView().getCenter()!;
        map
          .getView()
          .setCenter([
            center[0] + anchor[0] - oldCoordinateAtTarget[0],
            center[1] + anchor[1] - oldCoordinateAtTarget[1],
          ]);
      }, labelIds[0]);
      await expect
        .poll(async () => {
          const layoutAtEdge = await layoutPixels(page, labelIds[0]);
          return layoutAtEdge && layoutAtEdge.labelPixel[0] + layoutAtEdge.boxWidth / 2;
        })
        .toBeLessThan((await layoutPixels(page, labelIds[0]))!.viewport[0]);
    }
  }

  const menuAfterLabels = await openMapMenu(page);
  await menuAfterLabels
    .getByText("Stations", { exact: true })
    .locator("..")
    .getByText("Labels", { exact: true })
    .click();
  await closeMapMenu(page);
  await expect
    .poll(labelInfos)
    .toMatchObject([undefined, { id: labelIds[1] }, { id: labelIds[2] }]);
});
