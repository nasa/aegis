import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { Page } from "@playwright/test";
import DB from "../db";
import { test, expect } from "../fixtures/behavioralTest";
import { enablePlanningEditMode, selectPlanningEva } from "./planningHelpers";

const layerUuid = "30000000-0000-4000-8000-000000009101";
const sublayerUuid = "30000000-0000-4000-8000-000000009102";

async function openDirections(page: Page): Promise<void> {
  await page.getByLabel("preset Section", { exact: true }).click();
  await page
    .getByLabel("mapPreset", { exact: true })
    .filter({ hasText: "Overview" })
    .getByText("Overview", { exact: true })
    .click();
  await page.getByLabel("azimuth_panel", { exact: true }).click();
  if (!(await page.getByRole("button", { name: "Sun/Earth value source", exact: true }).count())) {
    await toggleSunEarthIndicators(page, true);
  }
}

async function toggleSunEarthIndicators(page: Page, enabled: boolean): Promise<void> {
  const source = page.getByRole("button", { name: "Sun/Earth value source", exact: true });
  if ((await source.count()) === Number(enabled)) return;
  await page.getByTestId("map-menu-launcher").click();
  const menu = page.getByTestId("map-menu-floating-panel");
  await expect(menu).toBeVisible();
  await menu.getByText("Sun/Earth Directions", { exact: true }).click();
  await menu.locator('svg[data-icon="xmark"]').click();
  if (enabled) await expect(source).toBeVisible();
  else await expect(source).toHaveCount(0);
}

async function sourceAngles(page: Page): Promise<number[]> {
  return page
    .locator('[data-map-mode="editor"] [class*="sunEarthIcon_"]')
    .evaluateAll((icons: HTMLElement[]) =>
      icons.map((icon) => {
        const x = Number.parseFloat(icon.style.left);
        const y = Number.parseFloat(icon.style.top);
        return ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      })
    );
}

test("invalid selected EVA dates retain the EVA warning through layer and preview fallback and preserve manual angles", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.presets[mission.ids.presetA].sunEnabled = true;
    doc.presets[mission.ids.presetA].earthEnabled = true;
    doc.presets[mission.ids.presetA].sunEarthFromDate = true;
    doc.presets[mission.ids.presetA].sunAzimuth = 34;
    doc.presets[mission.ids.presetA].earthAzimuth = 278;
    doc.layers[layerUuid] = { uuid: layerUuid, name: "Fallback time", createdAt: 1, updatedAt: 1 };
    doc.sublayers[sublayerUuid] = {
      uuid: sublayerUuid,
      layerUuid,
      type: "tile",
      name: "Fallback image",
      description: "",
      legend: null,
      path: "invalid-date-tiles",
      tilePattern: "xyz",
      boundingBox: null,
      tileFormat: "png",
      minNativeZoom: 0,
      maxNativeZoom: 1,
      maxZoom: 22,
      isTimeBased: true,
      timeLayerManifest: [
        {
          datetime: "2028-08-07T22:00:00Z",
          dirName: "slice",
          lowerBound: "2028-08-01T00:00:00Z",
          upperBound: "2028-09-01T00:00:00Z",
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    doc.presets[mission.ids.presetA].layerOrder = [{ layerUuid, sublayerUuids: [sublayerUuid] }];
    doc.presets[mission.ids.presetA].mapSublayerControls[sublayerUuid] = {
      name: "Fallback image",
      sublayerUuid,
      visible: true,
      style: { ...doc.presets[mission.ids.presetA].mapGridControl.style },
    };
  });
  await page.route("**/invalid-date-tiles/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64"
      ),
    })
  );
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningEva(page, "Survey Alpha");
  await openDirections(page);
  const source = page.getByRole("button", { name: "Sun/Earth value source", exact: true });

  for (const invalidDate of [Number.NaN, "not-a-date" as unknown as number]) {
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].datetime = invalidDate;
    });
    await expect(source).toHaveAttribute("data-status", "Fallback");
    await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
      "Selected EVA Survey Alpha has no valid date"
    );
    await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toContainText(
      "Time-based layer: Fallback image (fallback)"
    );

    await page.getByLabel("layers_panel", { exact: true }).click();
    await page
      .getByText("Time Preview", { exact: true })
      .locator("..")
      .getByRole("checkbox")
      .check();
    await expect(source).toHaveAttribute("data-status", "Preview");
    await page.getByLabel("azimuth_panel", { exact: true }).click();
    await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toContainText(
      "Preset preview"
    );
    await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
      "Selected EVA Survey Alpha has no valid date"
    );
    await page.getByLabel("layers_panel", { exact: true }).click();
    await page
      .getByText("Time Preview", { exact: true })
      .locator("..")
      .getByRole("checkbox")
      .uncheck();
    await page.getByLabel("azimuth_panel", { exact: true }).click();
  }
  await mission.change((doc) => {
    delete doc.sublayers[sublayerUuid];
    doc.presets[mission.ids.presetA].mapSublayerControls = {};
  });
  await page.getByLabel("layers_panel", { exact: true }).click();
  await page.getByLabel("azimuth_panel", { exact: true }).click();
  await expect(source).toHaveAttribute("data-status", "Manual");
  expect((await sourceAngles(page)).map(Math.round)).toEqual([34, 278]);
  await expect(page.getByLabel("sunEarthWarning", { exact: true })).toContainText(
    "Selected EVA Survey Alpha has no valid date"
  );
  expect((await mission.read()).presets[mission.ids.presetA]).toMatchObject({
    sunAzimuth: 34,
    earthAzimuth: 278,
    sunEarthFromDate: true,
  });
});

test("manual angle drags flush to their original preset on switch, and viewer controls and source info stay usable", async ({
  page,
  browser,
  baseURL,
  mission,
}) => {
  const database = new DB();
  const username = `Celestial viewer ${randomUUID()}`;
  const viewerContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  await mission.change((doc) => {
    doc.presets[mission.ids.presetA].sunEnabled = true;
    doc.presets[mission.ids.presetA].earthEnabled = true;
    doc.presets[mission.ids.presetA].sunEarthFromDate = false;
    doc.presets[mission.ids.presetA].sunAzimuth = 17;
    doc.presets[mission.ids.presetA].earthAzimuth = 263;
    doc.presets[mission.ids.presetB].sunEnabled = true;
    doc.presets[mission.ids.presetB].earthEnabled = true;
    doc.presets[mission.ids.presetB].sunEarthFromDate = false;
    doc.presets[mission.ids.presetB].sunAzimuth = 211;
    doc.presets[mission.ids.presetB].earthAzimuth = 44;
    doc.evas[mission.ids.evaA].datetime = Date.parse("2028-08-04T22:00:00Z");
    doc.landerLocation = { lat: 0.001, lng: 0.001 };
  });

  try {
    await database.executeQuery(
      "INSERT INTO app_user_db (username,password,is_super_admin,is_admin,permission_list,created_at,updated_at) VALUES ($1,$2,false,false,$3,$4,$4)",
      [
        username,
        await bcrypt.hash("celestial-viewer-password", 4),
        JSON.stringify([{ missionId: mission.id, permissions: { view: true, edit: false } }]),
        new Date().toISOString(),
      ]
    );
    const login = await viewerContext.request.post("/api/v1/auth/login", {
      data: { username, password: "celestial-viewer-password" },
    });
    expect(login.ok()).toBe(true);

    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectPlanningEva(page, "Survey Alpha");
    await openDirections(page);
    const source = page.getByRole("button", { name: "Sun/Earth value source", exact: true });
    await toggleSunEarthIndicators(page, false);
    await expect(source).toHaveCount(0);
    await toggleSunEarthIndicators(page, true);
    await expect(source).toHaveAttribute("aria-description", /Manual preset values/);

    const sunSlider = page
      .locator('[class*="degreesInputSlider"]')
      .nth(0)
      .locator('svg[viewBox="0 0 100 100"]');
    const sliderBounds = await sunSlider.boundingBox();
    expect(sliderBounds).not.toBeNull();
    const center = {
      x: sliderBounds!.x + sliderBounds!.width / 2,
      y: sliderBounds!.y + sliderBounds!.height / 2,
    };
    const currentRadians = (17 - 90) * (Math.PI / 180);
    await page.mouse.move(
      center.x + 45 * Math.cos(currentRadians),
      center.y + 45 * Math.sin(currentRadians)
    );
    await page.mouse.down();
    await page.mouse.move(center.x + 45, center.y, { steps: 8 });
    await page.mouse.up();
    await page.getByLabel("preset Section", { exact: true }).click();
    await page
      .getByLabel("mapPreset", { exact: true })
      .filter({ hasText: "Detail" })
      .getByText("Detail", { exact: true })
      .click();
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA].sunAzimuth)
      .not.toBe(17);
    expect((await mission.read()).presets[mission.ids.presetA].earthAzimuth).toBe(263);
    expect((await mission.read()).presets[mission.ids.presetB]).toMatchObject({
      sunAzimuth: 211,
      earthAzimuth: 44,
    });

    await page.setViewportSize({ width: 1960, height: 1080 });
    await page.getByLabel("preset Section", { exact: true }).click();
    await page
      .getByLabel("mapPreset", { exact: true })
      .filter({ hasText: "Overview" })
      .getByText("Overview", { exact: true })
      .click();
    await page.getByLabel("azimuth_panel", { exact: true }).click();
    await expect(page.locator('input[name="SunDegrees"]')).toHaveValue(
      String((await mission.read()).presets[mission.ids.presetA].sunAzimuth)
    );
    await page.locator("#sunEarthFromDateCheckbox").check();
    await expect
      .poll(async () => (await mission.read()).presets[mission.ids.presetA].sunEarthFromDate)
      .toBe(true);
    await expect(source).toHaveAttribute("data-status", "Calculated");
    await expect(page.getByLabel("sunEarthDateSource", { exact: true })).toContainText(
      "Selected EVA: Survey Alpha"
    );
    await page.locator("#sunEarthFromDateCheckbox").uncheck();
    await expect(source).toHaveAttribute("data-status", "Manual");
    await page.getByLabel("globalEditToggle", { exact: true }).click();
    await expect(page.locator('input[name="SunDegrees"]')).toHaveCount(0);
    await expect(source).toHaveAttribute("data-status", "Manual");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);

    const viewerPage = await viewerContext.newPage();
    await viewerPage.setViewportSize({ width: 360, height: 720 });
    await viewerPage.goto(mission.url);
    await expect(viewerPage.getByLabel("missionNameHeader", { exact: true })).toHaveText(
      mission.name
    );
    await openDirections(viewerPage);
    await expect(viewerPage.getByLabel("globalEditToggle", { exact: true })).toHaveCount(0);
    await expect(viewerPage.locator('input[name="SunDegrees"]')).toHaveCount(0);
    const viewerSource = viewerPage.getByRole("button", {
      name: "Sun/Earth value source",
      exact: true,
    });
    await expect(viewerSource).toHaveAttribute("aria-label", "Sun/Earth value source");
    await expect(viewerSource).toHaveAttribute("aria-description", /Manual preset values/);
    await expect
      .poll(() =>
        viewerPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      )
      .toBe(true);
    for (let tab = 0; tab < 40; tab += 1) {
      if (await viewerSource.evaluate((element) => element === document.activeElement)) break;
      await viewerPage.keyboard.press("Tab");
    }
    await expect(viewerSource).toBeFocused();
    await viewerPage.keyboard.press("Enter");
    await expect(viewerSource).toHaveAttribute("aria-description", /Manual preset values/);
  } finally {
    await viewerContext.close();
    await database.executeQuery("DELETE FROM app_user_db WHERE username=$1", [username]);
  }
});
