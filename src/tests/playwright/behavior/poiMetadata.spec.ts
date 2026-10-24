import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type Icon from "ol/style/Icon";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver } from "../fixtures/mapAssertions";
import {
  cancelPlanningField,
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
  selectPlanningPoi,
} from "./planningHelpers";

async function poiMarker(page: Page, uuid: string) {
  return page.evaluate((uuid) => {
    const map = window.__aegisMaps?.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) return null;
    const layer = map
      .getLayers()
      .getArray()
      .find((layer) => layer.getZIndex() === 15) as VectorLayer;
    const feature = layer?.getSource()?.getFeatureById(uuid);
    if (!feature || !layer.getVisible()) return null;
    const styles = layer.getStyleFunction()?.(feature, map.getView().getResolution());
    const style = Array.isArray(styles) ? styles[0] : styles;
    if (!style) return null;
    const canvas = (style.getImage() as Icon)?.getImage(1) as HTMLCanvasElement;
    return { emoji: feature.get("emoji"), image: canvas?.toDataURL() };
  }, uuid);
}

test.describe("POI metadata contracts", () => {
  for (const variant of ["multiline", "empty"] as const) {
    test(`POI ${variant} descriptions persist exactly while canceled drafts preserve associations`, async ({
      page,
      context,
      mission,
    }) => {
      const before = await mission.read();
      const description =
        variant === "empty" ? "" : 'Ridge α & <sample>\nSecond line: "ice" / regolith';
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPlanningPoi(page, "Reference POI");
      await page.getByLabel("info_panel", { exact: true }).click();
      const peer = await context.newPage();
      await mission.open(peer);
      await selectPlanningPoi(peer, "Reference POI");
      await peer.getByLabel("info_panel", { exact: true }).click();
      // Cancellation is checked against both authoritative state and a live consumer.
      await cancelPlanningField(page, "POI Description", "Discarded before save");
      expect(await mission.read()).toEqual(before);
      await savePlanningField(page, "POI Description", description);
      await expect(planningField(peer, "POI Description")).toHaveText(description);
      await expect
        .poll(async () => (await mission.read()).pois[mission.ids.poiA].description)
        .toBe(description);
      await cancelPlanningField(page, "POI Description", "Discarded after save");
      const after = await mission.read();
      expect(after.pois[mission.ids.poiA]).toEqual({
        ...before.pois[mission.ids.poiA],
        description,
        updatedAt: expect.any(Number),
      });
      for (const key of ["stations", "actions", "evas", "traverses", "folders"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
      for (const client of [page, peer]) {
        await mission.open(client);
        await selectPlanningPoi(client, "Reference POI");
        await client.getByLabel("info_panel", { exact: true }).click();
        await expect(planningField(client, "POI Description")).toHaveText(description);
      }
      await enablePlanningEditMode(page);
      const editor = await openPlanningField(page, "POI Description");
      await expect(editor.getByLabel("POI Description", { exact: true })).toHaveValue(description);
      await editor.getByText("Cancel", { exact: true }).click();
    });
  }

  const iconGroups = {
    circles: ["1F534", "1F7E0", "1F7E1", "1F7E2", "1F535", "1F7E3", "1F7E4", "26AB", "26AA"],
    squares: ["1F7E5", "1F7E7", "1F7E8", "1F7E9", "1F7E6", "1F7EA", "1F7EB", "2B1B", "2B1C"],
    triangles: ["1F53A", "1F53B"],
    diamonds: ["1F536", "1F537"],
  };
  for (const [shape, icons] of Object.entries(iconGroups)) {
    test(`every supported POI ${shape} icon updates the list, detail and rendered map on a peer and reload`, async ({
      page,
      context,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open(page);
      await enablePlanningEditMode(page);
      await selectPlanningPoi(page, "Reference POI");
      const peer = await context.newPage();
      await installMapObserver(peer);
      await mission.open(peer);
      await selectPlanningPoi(peer, "Reference POI");
      const dropdown = page.locator('[class*="iconDropdownContainer"]');
      const images = new Set<string>();
      for (const icon of icons) {
        const glyph = String.fromCodePoint(parseInt(icon, 16));
        await dropdown.click();
        const options = dropdown.locator('[class*="iconDropdownModalList"]');
        await options.getByText(glyph, { exact: true }).click();
        await expect(options).toHaveCount(0);
        await expect
          .poll(async () => (await mission.read()).pois[mission.ids.poiA].icon)
          .toBe(icon);
        for (const client of [page, peer]) {
          await expect(
            client.getByLabel("poiList-item").getByText(glyph, { exact: true })
          ).toBeVisible();
          await expect(client.locator('[class*="iconDropdownContainer"]')).toHaveText(glyph);
          await expect
            .poll(async () => (await poiMarker(client, mission.ids.poiA))?.emoji)
            .toBe(icon);
        }
        const marker = await poiMarker(page, mission.ids.poiA);
        expect(marker.image).toMatch(/^data:image\/png;base64,/);
        await expect.poll(() => poiMarker(peer, mission.ids.poiA)).toEqual(marker);
        expect(
          images.has(marker.image),
          "Each different icon must produce different map pixels"
        ).toBe(false);
        images.add(marker.image);
      }
      // Opening and blurring the menu does not choose an icon.
      await dropdown.click();
      await dropdown.press("Tab");
      await expect(dropdown.locator('[class*="iconDropdownModalList"]')).toHaveCount(0);
      const after = await mission.read();
      expect(after.pois[mission.ids.poiA]).toEqual({
        ...before.pois[mission.ids.poiA],
        icon: icons.at(-1),
        updatedAt: expect.any(Number),
      });
      for (const key of ["stations", "actions", "evas", "traverses", "folders"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
      const savedMarker = await poiMarker(page, mission.ids.poiA);
      for (const client of [page, peer]) {
        await mission.open(client);
        await selectPlanningPoi(client, "Reference POI");
        await expect
          .poll(async () => (await poiMarker(client, mission.ids.poiA))?.emoji)
          .toBe(icons.at(-1));
        await expect.poll(() => poiMarker(client, mission.ids.poiA)).toEqual(savedMarker);
        await expect(
          client
            .getByLabel("poiList-item")
            .getByText(String.fromCodePoint(parseInt(icons.at(-1), 16)), { exact: true })
        ).toBeVisible();
      }
    });
  }
});
