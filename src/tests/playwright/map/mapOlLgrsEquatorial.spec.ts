/**
 * Whole-Moon LGRS on an equatorial mission.
 *
 * Creates a throwaway mission near the Apollo 14 site (LTM zone 21, southern band M) on the
 * default EPSG:3857 projection with LGRS coordinates and the dynamic LGRS grid enabled, then
 * checks that the mouse readout shows an LTM LGRS string and that turning on the grid in a
 * preset draws it on the map. The mission is deleted when the test finishes.
 */

import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect } from "@playwright/test";
import { minimizeRexMenu, toggleEditMode, waitForPageReady } from "../helpers";

const LANDER = { lat: -3.645, lng: -17.47 };

// Full-style LTM readout at 10 m: zone + band + 25 km letters, then the two condensed axes,
// e.g. "21MDF E55 P54".
const LTM_READOUT = /^21M[A-Z]{2} [0-9A-Z-]{3} [0-9A-Z-]{3}$/;
const LAT_LNG_READOUT = /^(-?\d+\.\d{6}), (-?\d+\.\d{6})$/;

async function createLgrsMission(request: APIRequestContext): Promise<number> {
  const createResponse = await request.post("/api/v1/missionAutomerge");
  expect(createResponse.ok()).toBe(true);
  const created = (await createResponse.json()) as WrappedResponse<AutomergeDocListing>;
  const missionId = created.data?.missionId;
  expect(missionId).toBeTruthy();

  const fields: MissionFieldsUpdate = {
    name: `_PLAYWRIGHT LGRS Equatorial ${Math.floor(Math.random() * 1_000_000).toString(36)}`,
    landerLocation: LANDER,
    planetRadius: 1737400,
    initialZoom: 14,
    projIsCustom: false,
    projEpsg: "EPSG:3857",
    usingLGRSCoordinates: true,
    gridRenderMode: "dynamic-lgrs",
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

async function deleteMission(request: APIRequestContext, missionId: number): Promise<void> {
  const response = await request.delete("/api/v1/missionAutomerge", {
    data: { missionIds: [missionId] },
  });
  expect(response.ok()).toBe(true);
}

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

test.describe("Equatorial mission — whole-Moon LGRS", () => {
  test("deletes the mission when configuring it fails", async ({ page }) => {
    const request = page.request;
    const post = request.post.bind(request);
    let missionId: number | undefined;
    request.post = async (url, options) => {
      if (url === "/api/v1/missionAutomerge/fields") {
        throw new Error("Simulated mission configuration failure");
      }
      const response = await post(url, options);
      if (url === "/api/v1/missionAutomerge") {
        const created = (await response.json()) as WrappedResponse<AutomergeDocListing>;
        missionId = created.data?.missionId;
      }
      return response;
    };
    try {
      await expect(createLgrsMission(request)).rejects.toThrow(
        "Simulated mission configuration failure"
      );
      expect(missionId).toBeTruthy();
      const response = await request.get("/api/v1/docListing", { params: { missionId } });
      expect(response.ok()).toBe(true);
      const listings = (await response.json()) as WrappedResponse<AutomergeDocListing[]>;
      expect(listings.data).toEqual([]);
      missionId = undefined;
    } finally {
      request.post = post;
      if (missionId) {
        await request.delete("/api/v1/missionAutomerge", { data: { missionIds: [missionId] } });
      }
    }
  });

  test("mouse readout shows LTM LGRS and the dynamic grid renders", async ({ page }) => {
    const missionId = await createLgrsMission(page.request);

    try {
      await page.goto(`/mission/${missionId}`);
      await waitForPageReady(page);
      const mapPanel = page.getByTestId("mission-panel-map");
      const viewport = mapPanel.locator(".ol-viewport").first();
      await viewport.waitFor({ state: "visible", timeout: 15000 });
      await minimizeRexMenu(page);

      await test.step("mouse readout shows lat/lng and an LTM LGRS string", async () => {
        const box = await viewport.boundingBox();
        expect(box).not.toBeNull();
        // Off-centre so the pointer is not over the lander marker.
        await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
        await page.mouse.move(box!.x + box!.width * 0.4 + 5, box!.y + box!.height * 0.4 + 5);

        const latLng = mapPanel.getByText(LAT_LNG_READOUT);
        await expect(latLng).toBeVisible({ timeout: 5000 });
        const [, lat, lng] = (await latLng.textContent())!.match(LAT_LNG_READOUT)!;
        expect(Math.abs(Number(lat) - LANDER.lat)).toBeLessThan(0.25);
        expect(Math.abs(Number(lng) - LANDER.lng)).toBeLessThan(0.25);

        await expect(mapPanel.getByText(LTM_READOUT)).toBeVisible();
      });

      await test.step("dynamic LGRS grid renders when enabled in a preset", async () => {
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
        await expect(page.getByText("LGRS dynamically generated", { exact: true })).toBeVisible();

        const withoutGrid = await countMapPixels(page);

        await setGridCheckbox(page, "Show Grid", true);
        await setGridCheckbox(page, "Show Grid Labels", true);
        await expect
          .poll(() => countMapPixels(page), { timeout: 10000 })
          .toBeGreaterThan(withoutGrid + 1000);
        const withGrid = await countMapPixels(page);

        await setGridCheckbox(page, "Show Grid", false);
        await expect.poll(() => countMapPixels(page), { timeout: 10000 }).toBeLessThan(withGrid);

        await toggleEditMode(page);
      });
    } finally {
      await deleteMission(page.request, missionId);
    }
  });
});
