import { vi } from "vitest";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { selectExecution } from "./executionHelpers";
import { exactText } from "./browserAssertions";
const test = base.extend({ scenario: "execution" as BehavioralScenario });
const layerUuid = "30000000-0000-4000-8000-000000009801";
const sublayerIds = {
  noSlice: "30000000-0000-4000-8000-000000009802",
  oneSlice: "30000000-0000-4000-8000-000000009803",
  manySlices: "30000000-0000-4000-8000-000000009804",
};
const fixtureBase = "http://localhost:4000/preset-time-fixture";

const initialStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#ffffff",
  weight: 2,
  fillColor: "none",
  fillOpacity: 0,
  isDashed: false,
  dashLen: 10,
  altColor: "#ffffff",
  altOpacity: 1,
  showLabels: true,
};

const manyTimeSlices: TimeLayerInfo[] = [
  {
    datetime: "2028-01-01T00:00:00Z",
    dirName: "slice-a",
    lowerBound: "2028-01-01T00:00:00Z",
    upperBound: "2028-01-02T00:00:00Z",
  },
  {
    datetime: "2028-01-03T00:00:00Z",
    dirName: "slice-b",
    lowerBound: "2028-01-02T00:00:00Z",
    upperBound: "2028-01-04T00:00:00Z",
  },
  {
    datetime: "2028-01-05T00:00:00Z",
    dirName: "slice-c",
    lowerBound: "2028-01-04T00:00:00Z",
    upperBound: "2028-01-06T00:00:00Z",
  },
];

function pngTile(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = color;
  context.fillRect(0, 0, 256, 256);
  return canvas.toDataURL("image/png");
}
function mapPixel(_page: Page): string {
  const viewport = document.querySelector<HTMLElement>('[data-map-mode="editor"] .ol-viewport')!;
  const canvas = document.createElement("canvas");
  canvas.width = viewport.clientWidth;
  canvas.height = viewport.clientHeight;
  const context = canvas.getContext("2d")!;
  for (const layer of viewport.querySelectorAll<HTMLCanvasElement>(".ol-layer canvas")) {
    if (!layer.width || !layer.height) continue;
    context.save();
    context.globalAlpha = Number(layer.parentElement?.style.opacity || 1);
    context.setTransform(new DOMMatrix(layer.style.transform));
    context.drawImage(layer, 0, 0);
    context.restore();
  }
  const data = context.getImageData(
    Math.floor(canvas.width / 2 + 90),
    Math.floor(canvas.height / 2 + 90),
    1,
    1
  ).data;
  return `#${[...data.subarray(0, 3)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
function activeTimePaths(_page: Page, uuid: string): string[] {
  const map = window.__aegisMaps.find(
    (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
  )?.map;
  return (
    map
      ?.getLayers()
      .getArray()
      .filter((layer) => layer.get("uuid") === uuid)
      .map((layer) => layer.get("_resolvedPath") as string) ?? []
  );
}
async function selectPreset(page: Page, name: string): Promise<void> {
  await page.getByLabelText("preset Section", { exact: true }).click();
  await page
    .getByLabelText("mapPreset", { exact: true })
    .filter({ hasText: name })
    .getByText(name, { exact: true })
    .click();
  await expect
    .element(page.getBySelector('div[aria-label="Preset Title"]'))
    .toHaveTextContent(exactText(name));
}

function addTimeLayer(
  doc: Mission,
  presetUuid: string,
  uuid: string,
  name: string,
  path: string,
  manifest: TimeLayerInfo[],
  visible: boolean
) {
  doc.sublayers[uuid] = {
    uuid,
    layerUuid,
    type: "tile",
    name,
    description: "Test-owned solid time slices",
    legend: null,
    path,
    tilePattern: "{z}/{x}/{y}.png",
    boundingBox: null,
    tileFormat: "xyz",
    minNativeZoom: 0,
    maxNativeZoom: 1,
    maxZoom: 22,
    isTimeBased: true,
    timeLayerManifest: manifest,
    createdAt: 1,
    updatedAt: 1,
  };
  doc.presets[presetUuid].mapSublayerControls[uuid] = {
    name,
    sublayerUuid: uuid,
    visible,
    style: { ...initialStyle },
  };
}

test("time slices paint inclusive date boundaries across plan and execution scopes, including static and single slices", async ({
  page,
  mission,
}) => {
  const tiles = new Map([
    ["static", pngTile("#808080")],
    ["only", pngTile("#ffff00")],
    ["slice-a", pngTile("#ff0000")],
    ["slice-b", pngTile("#00ff00")],
    ["slice-c", pngTile("#0000ff")],
  ]);
  const requests: string[] = [];
  const setSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!.set!;
  vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(function (
    this: HTMLImageElement,
    url: string
  ) {
    if (!url.startsWith(fixtureBase)) return setSource.call(this, url);
    requests.push(url);
    const color = [...tiles.keys()].find((key) => url.includes(`/${key}/`));
    if (!color) throw new Error(`Unexpected tile fixture: ${url}`);
    setSource.call(this, tiles.get(color)!);
  });
  await mission.change((doc) => {
    doc.projIsCustom = false;
    doc.projEpsg = "EPSG:3857";
    doc.layers[layerUuid] = { uuid: layerUuid, name: "Dated raster", createdAt: 1, updatedAt: 1 };
    const oneSlice: TimeLayerInfo[] = [
      {
        datetime: "2028-01-03T00:00:00Z",
        dirName: "only",
        lowerBound: "2028-01-01T00:00:00Z",
        upperBound: "2028-01-06T00:00:00Z",
      },
    ];
    addTimeLayer(
      doc,
      mission.ids.presetA,
      sublayerIds.noSlice,
      "Static raster",
      `${fixtureBase}/static`,
      [],
      false
    );
    addTimeLayer(
      doc,
      mission.ids.presetA,
      sublayerIds.oneSlice,
      "Single-date raster",
      `${fixtureBase}/single`,
      oneSlice,
      false
    );
    addTimeLayer(
      doc,
      mission.ids.presetA,
      sublayerIds.manySlices,
      "Multi-date raster",
      `${fixtureBase}/multi`,
      manyTimeSlices,
      true
    );
    doc.presets[mission.ids.presetA].layerOrder = [
      {
        layerUuid,
        sublayerUuids: [sublayerIds.noSlice, sublayerIds.oneSlice, sublayerIds.manySlices],
      },
    ];
    doc.evas[mission.ids.evaA].datetime = Date.parse("2028-01-01T00:00:00Z");
    doc.evas[mission.ids.rexEvaA].datetime = Date.parse("2028-01-02T00:00:00Z");
    doc.evas[mission.ids.rexEvaB].datetime = Date.parse("2028-01-04T00:00:00Z");
  });
  await mission.open();
  await selectPreset(page, "Overview");
  await selectExecution(page, "Survey Alpha", mission.ids.evaA);

  const sourcePath = (slice: string) => `${fixtureBase}/multi/${slice}`;
  await expect
    .poll(() => activeTimePaths(page, sublayerIds.manySlices))
    .toEqual([sourcePath("slice-a")]);
  await expect.poll(() => mapPixel(page)).toBe("#ff0000");
  expect(requests.some((url) => url.includes("/multi/slice-a/"))).toBe(true);

  await selectExecution(page, "Survey Alpha", mission.ids.rexEvaA);
  await expect
    .poll(() => activeTimePaths(page, sublayerIds.manySlices))
    .toEqual([sourcePath("slice-b")]);
  await expect.poll(() => mapPixel(page)).toBe("#00ff00");
  expect(requests.some((url) => url.includes("/multi/slice-b/"))).toBe(true);

  await selectExecution(page, "Survey Bravo", mission.ids.rexEvaB);
  await expect
    .poll(() => activeTimePaths(page, sublayerIds.manySlices))
    .toEqual([sourcePath("slice-c")]);
  await expect.poll(() => mapPixel(page)).toBe("#0000ff");
  expect(requests.some((url) => url.includes("/multi/slice-c/"))).toBe(true);

  await mission.change((doc) => {
    doc.evas[mission.ids.rexEvaB].datetime = Date.parse("2028-01-06T00:00:01Z");
  });
  await expect.poll(() => activeTimePaths(page, sublayerIds.manySlices)).toEqual([]);

  await selectExecution(page, "Survey Alpha", mission.ids.evaA);
  await mission.change((doc) => {
    doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.manySlices].visible = false;
    doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.oneSlice].visible = true;
  });
  await expect
    .poll(() => activeTimePaths(page, sublayerIds.oneSlice))
    .toEqual([`${fixtureBase}/single/only`]);
  await expect.poll(() => mapPixel(page)).toBe("#ffff00");
  expect(requests.some((url) => url.includes("/single/only/"))).toBe(true);

  await mission.change((doc) => {
    doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.oneSlice].visible = false;
    doc.presets[mission.ids.presetA].mapSublayerControls[sublayerIds.noSlice].visible = true;
  });
  await expect
    .poll(() => activeTimePaths(page, sublayerIds.noSlice))
    .toEqual([`${fixtureBase}/static`]);
  await expect.poll(() => mapPixel(page)).toBe("#808080");
  expect(requests.some((url) => url.includes("/static/0/"))).toBe(true);
  expect(await mission.read()).toMatchObject({
    presets: {
      [mission.ids.presetA]: {
        mapSublayerControls: { [sublayerIds.noSlice]: { visible: true } },
      },
    },
  });
});
