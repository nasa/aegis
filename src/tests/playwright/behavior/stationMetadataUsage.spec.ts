import type { Page } from "@playwright/test";
import type VectorLayer from "ol/layer/Vector";
import type Icon from "ol/style/Icon";
import { test, expect } from "../fixtures/behavioralTest";
import { installMapObserver } from "../fixtures/mapAssertions";
import { enablePlanningEditMode, planningField, savePlanningField } from "./planningHelpers";

async function selectStation(page: Page, name: string): Promise<void> {
  await page.getByLabel("station Section", { exact: true }).click();
  const selectedName = planningField(page, "Station");
  if (!(await selectedName.isVisible()) || (await selectedName.textContent()) !== name) {
    await page
      .getByLabel("stationList-item", { exact: true })
      .filter({ hasText: name })
      .getByText(name, { exact: true })
      .click();
  }
  await expect(selectedName).toHaveText(name);
}

async function stationMarker(page: Page, uuid: string) {
  return page.evaluate((uuid) => {
    const map = window.__aegisMaps?.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) return null;
    const layer = map
      .getLayers()
      .getArray()
      .find((item) => item.getZIndex() === 14) as VectorLayer;
    const feature = layer?.getSource()?.getFeatureById(uuid);
    if (!feature || !layer.getVisible()) return null;
    const styles = layer.getStyleFunction()?.(feature, map.getView().getResolution());
    const style = Array.isArray(styles) ? styles[0] : styles;
    if (!style) return null;
    const canvas = (style.getImage() as Icon)?.getImage(1) as HTMLCanvasElement;
    return { emoji: feature.get("emoji"), image: canvas?.toDataURL() };
  }, uuid);
}

test.describe("Shared station metadata and usage", () => {
  test.use({ scenario: "execution" });

  test("station description and rendered icon synchronize with a peer and persist after reload", async ({
    page,
    context,
    mission,
  }) => {
    const arranged = await mission.read();
    await mission.open(page);
    await enablePlanningEditMode(page);
    await selectStation(page, "Bravo station");
    const peer = await context.newPage();
    await installMapObserver(peer);
    await mission.open(peer);
    await selectStation(peer, "Bravo station");
    await peer.getByLabel("info_panel", { exact: true }).click();

    const description = 'Survey boundary α & <crater>\nSecond line: "shared"';
    await savePlanningField(page, "Station Description", description);
    await expect(planningField(peer, "Station Description")).toHaveText(description);

    // Emoji picker exposes names to assistive technology; choosing the existing
    // palette icon updates the station document through its UI control.
    await page.getByLabel("Pick Icon", { exact: true }).click();
    const emojiSearch = page.getByPlaceholder("Search", { exact: true });
    await emojiSearch.fill("large orange diamond");
    const glyph = String.fromCodePoint(0x1f536);
    await page.getByRole("button", { name: glyph, exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationB].icon)
      .toMatch(/^1f536$/i);
    await expect(
      page
        .getByLabel("stationList-item", { exact: true })
        .filter({ hasText: "Bravo station" })
        .getByText(glyph, { exact: true })
    ).toBeVisible();
    await expect
      .poll(async () => (await stationMarker(page, mission.ids.stationB))?.emoji)
      .toBe("1f536");
    const pageMarker = await stationMarker(page, mission.ids.stationB);
    expect(pageMarker?.image).toMatch(/^data:image\/png;base64,/);

    const after = await mission.read();
    expect(after.stations[mission.ids.stationB]).toEqual({
      ...arranged.stations[mission.ids.stationB],
      description,
      icon: "1f536",
      updatedAt: expect.any(Number),
    });
    expect(after.stations[mission.ids.stationA]).toEqual(arranged.stations[mission.ids.stationA]);
    expect(after.stations[mission.ids.rexStationB]).toEqual(
      arranged.stations[mission.ids.rexStationB]
    );
    expect(after.stations[mission.ids.rexStationABravo]).toEqual(
      arranged.stations[mission.ids.rexStationABravo]
    );
    expect(after.pois).toEqual(arranged.pois);
    expect(after.evas).toEqual(arranged.evas);
    expect(after.traverses).toEqual(arranged.traverses);
    expect(after.actions).toEqual(arranged.actions);
    expect(after.folders).toEqual(arranged.folders);

    for (const client of [page, peer]) {
      await mission.open(client);
      await selectStation(client, "Bravo station");
      await client.getByLabel("info_panel", { exact: true }).click();
      await expect(planningField(client, "Station Description")).toHaveText(description);
      await expect.poll(() => stationMarker(client, mission.ids.stationB)).toEqual(pageMarker);
    }
    await expect.poll(() => stationMarker(peer, mission.ids.stationB)).toEqual(pageMarker);
  });
});
