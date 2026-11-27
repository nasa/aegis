import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type Icon from "ol/style/Icon";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver } from "../fixtures/mapAssertions";
import {
  enablePlanningEditMode,
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

test("saved POI Unicode text and icon reach a live peer and survive server-backed reloads", async ({
  page,
  context,
  mission,
}) => {
  const before = await mission.read();
  const description = 'Ridge α & <sample>\nSecond line: "ice" / regolith';
  await mission.open(page);
  await enablePlanningEditMode(page);
  await selectPlanningPoi(page, "Reference POI");
  await page.getByLabel("info_panel", { exact: true }).click();
  const peer = await context.newPage();
  await installMapObserver(peer);
  await mission.open(peer);
  await selectPlanningPoi(peer, "Reference POI");
  await peer.getByLabel("info_panel", { exact: true }).click();
  await savePlanningField(page, "POI Description", description);
  await expect(planningField(peer, "POI Description")).toHaveText(description);
  const icon = "1F7E0";
  const glyph = String.fromCodePoint(parseInt(icon, 16));
  const dropdown = page.locator('[class*="iconDropdownContainer"]');
  await dropdown.click();
  await dropdown
    .locator('[class*="iconDropdownModalList"]')
    .getByText(glyph, { exact: true })
    .click();
  await expect.poll(async () => (await mission.read()).pois[mission.ids.poiA].icon).toBe(icon);
  for (const client of [page, peer]) {
    await expect(client.getByLabel("poiList-item").getByText(glyph, { exact: true })).toBeVisible();
    await expect(client.locator('[class*="iconDropdownContainer"]')).toHaveText(glyph);
    await expect.poll(async () => (await poiMarker(client, mission.ids.poiA))?.emoji).toBe(icon);
  }
  const marker = await poiMarker(page, mission.ids.poiA);
  expect(marker.image).toMatch(/^data:image\/png;base64,/);
  await expect.poll(() => poiMarker(peer, mission.ids.poiA)).toEqual(marker);
  const after = await mission.read();
  expect(after.pois[mission.ids.poiA]).toEqual({
    ...before.pois[mission.ids.poiA],
    description,
    icon,
    updatedAt: expect.any(Number),
  });
  for (const key of ["stations", "actions", "evas", "traverses", "folders"] as const)
    expect(after[key]).toEqual(before[key]);
  for (const client of [page, peer]) {
    await mission.open(client);
    await selectPlanningPoi(client, "Reference POI");
    await client.getByLabel("info_panel", { exact: true }).click();
    await expect(planningField(client, "POI Description")).toHaveText(description);
    await expect.poll(() => poiMarker(client, mission.ids.poiA)).toEqual(marker);
    await expect(client.getByLabel("poiList-item").getByText(glyph, { exact: true })).toBeVisible();
  }
});
