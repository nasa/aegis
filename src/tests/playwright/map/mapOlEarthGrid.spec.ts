/**
 * Earth grid on a JSC mission.
 *
 * Creates a throwaway Earth mission at JSC (UTM 15R) on the default EPSG:3857 projection with
 * grid coordinates and the dynamic grid enabled, labelled in Earth ACC by default. Checks the
 * mouse readout and its scheme tag in ACC, switches the mission's label scheme to MGRS and back
 * without reloading, and checks that turning on the grid in a preset draws it. The mission is
 * deleted when the test finishes.
 */

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { minimizeRexMenu, toggleEditMode, waitForPageReady } from "../helpers";

const JSC = { lat: 29.5593, lng: -95.09 };

// Full-style readouts at 10 m, each followed by its scheme tag: Earth ACC (zone, band, 100 km
// square, 25 km area, then the two condensed axes, e.g. "15RTNDC X51 W77") and canonical MGRS
// (e.g. "15R TN 9751 7177").
const ACC_READOUT = /^15R[A-Z]{4} [0-9A-Z-]{3} [0-9A-Z-]{3}$/;
const MGRS_READOUT = /^15R [A-Z]{2} \d{4} \d{4}$/;
const LAT_LNG_READOUT = /^(-?\d+\.\d{6}), (-?\d+\.\d{6})$/;

async function createEarthMission(request: APIRequestContext): Promise<number> {
  const createResponse = await request.post("/api/v1/missionAutomerge");
  expect(createResponse.ok()).toBe(true);
  const created = (await createResponse.json()) as WrappedResponse<AutomergeDocListing>;
  const missionId = created.data?.missionId;
  expect(missionId).toBeTruthy();

  const fields: MissionFieldsUpdate = {
    name: `_PLAYWRIGHT Earth Grid ${Math.floor(Math.random() * 1_000_000).toString(36)}`,
    landerLocation: JSC,
    planetRadius: 6378137,
    initialZoom: 14,
    projIsCustom: false,
    projEpsg: "EPSG:3857",
    usingLGRSCoordinates: true,
    gridRenderMode: "dynamic-lgrs",
    gridSystem: "earth-wgs84",
    earthGridLabelScheme: "lunar-acc",
  };
  try {
    const fieldsResponse = await request.post("/api/v1/missionAutomerge/fields", {
      data: { missionId, fields },
    });
    expect(fieldsResponse.ok()).toBe(true);
    return missionId;
  } catch (error) {
    await deleteMission(request, missionId);
    throw error;
  }
}

async function setLabelScheme(
  request: APIRequestContext,
  missionId: number,
  earthGridLabelScheme: GridLabelScheme
): Promise<void> {
  const response = await request.post("/api/v1/missionAutomerge/fields", {
    data: { missionId, fields: { earthGridLabelScheme } satisfies MissionFieldsUpdate },
  });
  expect(response.ok()).toBe(true);
}

async function deleteMission(request: APIRequestContext, missionId: number): Promise<void> {
  const response = await request.delete("/api/v1/missionAutomerge", {
    data: { missionIds: [missionId] },
  });
  expect(response.ok()).toBe(true);
}

// Teardown runs in its own timeout slot, so the mission is deleted even after a test timeout.
const test = base.extend<{ missionId: number }>({
  missionId: async ({ page }, provide) => {
    const missionId = await createEarthMission(page.request);
    await provide(missionId);
    await deleteMission(page.request, missionId);
  },
});

/** Number of non-transparent pixels across the map's canvases (the mission has no tile layers). */
async function countMapPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvases = document.querySelectorAll<HTMLCanvasElement>(
      "[data-testid='mission-panel-map'] .ol-viewport canvas"
    );
    let painted = 0;
    for (const canvas of canvases) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || !canvas.width || !canvas.height) continue;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) painted++;
      }
    }
    return painted;
  });
}

/** Toggle a preset grid checkbox ("Show Grid" / "Show Grid Labels") in the Grid pane. */
async function setGridCheckbox(page: Page, label: string, checked: boolean): Promise<void> {
  const checkbox = page
    .getByText(label, { exact: true })
    .locator("..")
    .locator("input[type='checkbox']");
  await checkbox.setChecked(checked);
  await expect(checkbox).toBeChecked({ checked });
}

/** Expects the grid readout to match `pattern`, tagged with the scheme `tag`. */
async function expectGridReadout(mapPanel: Locator, pattern: RegExp, tag: string): Promise<void> {
  const tagElement = mapPanel.getByTestId("mouse-grid-scheme");
  await expect(tagElement).toHaveText(tag, { timeout: 5000 });
  const readout = tagElement.locator("..");
  await expect
    .poll(async () => {
      const text = (await readout.textContent()) ?? "";
      return text.endsWith(tag) ? text.slice(0, -tag.length) : text;
    })
    .toMatch(pattern);
}

test.describe("Earth mission — UTM grid in ACC and MGRS", () => {
  test("readout and grid follow the mission label scheme without a reload", async ({
    page,
    missionId,
  }) => {
    await page.goto(`/mission/${missionId}`);
    await waitForPageReady(page);
    const mapPanel = page.getByTestId("mission-panel-map");
    const viewport = mapPanel.locator(".ol-viewport").first();
    await viewport.waitFor({ state: "visible", timeout: 15000 });
    await minimizeRexMenu(page);
    let loads = 0;
    page.on("load", () => loads++);

    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();
    // Off-centre so the pointer is not over the lander marker.
    const hover = async () => {
      await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
      await page.mouse.move(box!.x + box!.width * 0.4 + 5, box!.y + box!.height * 0.4 + 5);
    };

    await test.step("mouse readout shows lat/lng and a full Earth ACC string", async () => {
      await hover();
      const latLng = mapPanel.getByText(LAT_LNG_READOUT);
      await expect(latLng).toBeVisible({ timeout: 5000 });
      const [, lat, lng] = (await latLng.textContent())!.match(LAT_LNG_READOUT)!;
      expect(Math.abs(Number(lat) - JSC.lat)).toBeLessThan(0.25);
      expect(Math.abs(Number(lng) - JSC.lng)).toBeLessThan(0.25);

      await expectGridReadout(mapPanel, ACC_READOUT, "ACC");
    });

    await test.step("switching the scheme to MGRS relabels the readout", async () => {
      await setLabelScheme(page.request, missionId, "mgrs");
      // The readout follows the switch before the pointer moves again.
      await expectGridReadout(mapPanel, MGRS_READOUT, "MGRS");
      await hover();
      await expectGridReadout(mapPanel, MGRS_READOUT, "MGRS");
    });

    await test.step("dynamic grid renders when enabled in a preset", async () => {
      await page.getByLabel("preset Section", { exact: true }).click();
      await expect(page.getByLabel("leftPanelTitle", { exact: true })).toContainText(
        "Map Display Presets"
      );
      await toggleEditMode(page);
      await page.getByLabel("Add", { exact: true }).click();
      await expect(
        page.getByLabel("selectedPreset", { exact: true }).getByLabel("leftPresetName")
      ).toBeVisible();

      await page.getByLabel("grid_panel", { exact: true }).click();
      await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
        "Grid Preferences"
      );

      const withoutGrid = await countMapPixels(page);
      await setGridCheckbox(page, "Show Grid", true);
      await setGridCheckbox(page, "Show Grid Labels", true);
      await expect
        .poll(() => countMapPixels(page), { timeout: 10000 })
        .toBeGreaterThan(withoutGrid + 1000);

      await toggleEditMode(page);
    });

    await test.step("switching back to ACC restores the ACC readout", async () => {
      await setLabelScheme(page.request, missionId, "lunar-acc");
      await hover();
      await expectGridReadout(mapPanel, ACC_READOUT, "ACC");
      expect(loads).toBe(0);
    });
  });
});
