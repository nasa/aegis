import { copyFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type LineString from "ol/geom/LineString";
import { test, expect } from "../fixtures/behavioralTest";

async function openMeasurements(page: Page) {
  await page.locator('[data-tooltip-content="Measurements"]').click();
  await expect(page.locator('[data-tooltip-content="Add Temporary Measurement"]')).toBeVisible();
}

async function measurements(page: Page) {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) return [];
    return map
      .getLayers()
      .getArray()
      .flatMap((layer) => {
        const source = (layer as VectorLayer).getSource?.();
        if (!source || !("getFeatures" in source)) return [];
        return source
          .getFeatures()
          .filter((feature) => feature.get("mapItemType") === "measurement")
          .map((feature) => ({
            id: String(feature.getId()),
            coordinates: (feature.getGeometry() as LineString).getCoordinates(),
          }));
      });
  });
}

async function view(page: Page) {
  return page.evaluate(() => {
    const map = window.__aegisMaps.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    ).map;
    return {
      center: map.getView().getCenter(),
      resolution: map.getView().getResolution(),
      animating: map.getView().getAnimating(),
    };
  });
}

const tabs = (page: Page) => page.locator('[class*="measureTabContainer"]');

for (const zoom of [17, 19]) {
  test(`temporary measurement tabs preserve the map view and stay local through navigation at zoom ${zoom}`, async ({
    page,
    context,
    request,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.initialZoom = zoom;
    });
    const before = await mission.read();
    let extraId: number | undefined;
    try {
      await mission.open(page);
      await openMeasurements(page);
      await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
      await expect(tabs(page)).toHaveCount(1);
      await expect.poll(() => measurements(page)).toHaveLength(1);
      const first = (await measurements(page))[0];
      const canvas = page.locator('[data-map-mode="editor"] .ol-viewport');
      await canvas.hover({ position: { x: 150, y: 120 } });
      const oldResolution = (await view(page)).resolution;
      await page.mouse.wheel(0, -240);
      await expect.poll(async () => (await view(page)).resolution).not.toBe(oldResolution);
      await expect.poll(async () => (await view(page)).animating).toBe(false);
      await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
      await expect(tabs(page)).toHaveCount(2);
      const second = (await measurements(page))[0];
      expect(second.id).not.toBe(first.id);
      expect(second.coordinates).not.toEqual(first.coordinates);
      const fixedView = await view(page);
      for (const [index, expected] of [
        [0, first],
        [1, second],
      ] as const) {
        await tabs(page).nth(index).locator('svg[data-icon="ruler"]').click();
        await expect.poll(() => measurements(page)).toEqual([expected]);
        expect(await view(page)).toEqual(fixedView);
      }
      await page.locator('[data-tooltip-content="Timeline"]').click();
      await openMeasurements(page);
      await expect(tabs(page)).toHaveCount(2);
      await expect.poll(() => measurements(page)).toEqual([second]);
      const peer = await context.newPage();
      await mission.open(peer);
      await openMeasurements(peer);
      await expect(tabs(peer)).toHaveCount(0);
      expect(await mission.read()).toEqual(before);

      const create = await request.post("/api/v1/missionAutomerge", { data: {} });
      expect(create.ok()).toBe(true);
      extraId = (await create.json()).data.missionId as number;
      const name = `Measurement switch ${randomUUID()}`;
      expect(
        (
          await request.post("/api/v1/missionAutomerge/fields", {
            data: { missionId: extraId, fields: { name } },
          })
        ).ok()
      ).toBe(true);
      await page.locator('svg[data-icon="bars"]').click();
      await page
        .locator("tr")
        .filter({ has: page.getByText(name, { exact: true }) })
        .getByRole("button", { name: "Select", exact: true })
        .click();
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(name);
      await openMeasurements(page);
      await expect(tabs(page)).toHaveCount(0);
      await page.locator('svg[data-icon="bars"]').click();
      await page
        .locator("tr")
        .filter({ has: page.getByText(mission.name, { exact: true }) })
        .getByRole("button", { name: "Select", exact: true })
        .click();
      await expect(page.getByLabel("missionNameHeader", { exact: true })).toHaveText(mission.name);
      await openMeasurements(page);
      await expect(tabs(page)).toHaveCount(0);
      await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
      await expect(tabs(page)).toHaveCount(1);
      await mission.open(page);
      await openMeasurements(page);
      await expect(tabs(page)).toHaveCount(0);
      expect(await mission.read()).toEqual(before);
    } finally {
      if (extraId)
        expect(
          (
            await request.delete("/api/v1/missionAutomerge", { data: { missionIds: [extraId] } })
          ).ok()
        ).toBe(true);
    }
  });
}

for (const dismissal of ["Escape", "backdrop"] as const) {
  test(`real DEM slope key exposes ranges, shared graph colors and keyboard focus with ${dismissal} dismissal`, async ({
    page,
    request,
    mission,
  }) => {
    const lander = { lat: -3.4256273976012914, lng: -17.462978266484328 };
    expect(process.env.STATIC_DIR).toBeTruthy();
    const directory = path.resolve(process.env.STATIC_DIR, "missionFiles", String(mission.id));
    await mkdir(directory, { recursive: true });
    await copyFile(
      fileURLToPath(
        new URL("../../vitest/fixtures/raster/apollo14-golden-striped.tif", import.meta.url)
      ),
      path.join(directory, "measure-dem.tif")
    );
    await mission.change((doc) => {
      doc.demFilePath = "measure-dem.tif";
      doc.demResolution = 2;
      doc.landerLocation = lander;
      doc.landerElevationMeters = -1049.260009765625;
      doc.initialZoom = 22;
    });
    const before = await mission.read();
    const terrain = await request.post(`/api/v1/terrain-profile?missionId=${mission.id}`, {
      data: { path: [lander, lander], pathSegmentDistances: [0], getElevationOnly: true },
    });
    expect(terrain.ok()).toBe(true);
    expect((await terrain.json()).data.elevationsMeters).toEqual([
      [-1049.260009765625, -1049.260009765625],
    ]);
    await mission.open(page);
    await openMeasurements(page);
    const profileResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/terrain-profile?") &&
        response.request().method() === "POST"
    );
    await page.locator('[data-tooltip-content="Add Temporary Measurement"]').click();
    const response = await profileResponse;
    expect(response.ok()).toBe(true);
    const profile = (await response.json()).data as TerrainProfile;
    expect(profile.elevationsMeters[0].length).toBeGreaterThanOrEqual(2);
    expect(profile.elevationsMeters[0].every(Number.isFinite)).toBe(true);
    await expect(tabs(page)).toHaveCount(1);
    const graph = page.locator('[class*="measureCanvasContainer"] canvas');
    const standardGraph = await graph.screenshot();
    const key = page.getByRole("button", { name: "Key", exact: true });
    await key.focus();
    await page.keyboard.press("Enter");
    const legend = page.getByRole("dialog", {
      name: "Slope color = absolute degrees",
      exact: true,
    });
    await expect(legend).toBeVisible();
    for (const example of ["Path Grade", "Terrain Slope"]) {
      await expect(
        legend.getByLabel(`${example} example`, { exact: true }).locator("span")
      ).toHaveCount(24);
    }
    const standardRanges = [
      "0–2°",
      ">2–4°",
      ">4–6°",
      ">6–8°",
      ">8–10°",
      ">10–12°",
      ">12–14°",
      ">14–16°",
      ">16–18°",
      ">18–20°",
      ">20°",
    ];
    for (const label of standardRanges)
      await expect(legend.getByText(label, { exact: true })).toBeVisible();
    await expect(legend.getByText(/uphill or downhill angle/)).toBeVisible();
    await expect(legend.getByText(/regardless of travel direction/)).toBeVisible();
    if (dismissal === "Escape") await page.keyboard.press("Escape");
    else await page.mouse.click(2, 2);
    await expect(legend).not.toBeVisible();
    await expect(key).toBeFocused();
    const mode = page.getByRole("button", { name: "Colorblind", exact: true });
    await expect(mode).toHaveAttribute("aria-pressed", "false");
    await mode.click();
    await expect(mode).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await graph.screenshot()).equals(standardGraph)).toBe(false);
    await key.click();
    const accessibleRanges = ["0–2°", ">2–4°", ">4–8°", ">8–12°", ">12–16°", ">16–20°", ">20°"];
    for (const label of accessibleRanges)
      await expect(legend.getByText(label, { exact: true })).toBeVisible();
    await expect(legend.locator('[class*="swatch"]')).toHaveCount(7);
    await legend.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator('[data-tooltip-content="Timeline"]').click();
    await expect(mode).toHaveAttribute("aria-pressed", "true");
    await openMeasurements(page);
    await expect(mode).toHaveAttribute("aria-pressed", "true");
    await expect(tabs(page)).toHaveCount(1);
    expect(await mission.read()).toEqual(before);
  });
}
