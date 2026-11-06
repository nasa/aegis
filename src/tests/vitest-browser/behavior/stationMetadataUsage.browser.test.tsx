import { exactText, isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import type VectorLayer from "ol/layer/Vector";
import type Icon from "ol/style/Icon";
import { test as base, expect } from "./missionHarness";
import { seedAction, seedPoi } from "tests/playwright/fixtures/entitySeeds";
import {
  cancelPlanningField,
  enablePlanningEditMode,
  planningField,
  savePlanningField,
  selectPlanningPoi,
} from "./planningHelpers";

async function selectStation(page: Page, name: string): Promise<void> {
  await page.getByLabelText("station Section", { exact: true }).click();
  const selectedName = planningField(page, "Station");
  if (!isVisible(selectedName) || selectedName.element().textContent !== name) {
    await page
      .getByLabelText("stationList-item", { exact: true })
      .filter({ hasText: name })
      .getByText(name, { exact: true })
      .click();
  }
  await expect.element(selectedName).toHaveTextContent(exactText(name));
}

async function stationMarker(uuid: string) {
  return (() => {
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
  })();
}

const test = base.extend({ scenario: "execution" as BehavioralScenario });

test.describe("Shared station metadata and usage", () => {
  test("station description and icon agree in list, map, linked POIs and shared EVA usage", async ({
    page,
    mission,
  }) => {
    const poiUuid = "70000000-0000-4000-8000-000000000001";
    const poiActionUuid = "70000000-0000-4000-8000-000000000003";
    await mission.change((doc) => {
      doc.pois[poiUuid] = seedPoi({
        uuid: poiUuid,
        name: "Bravo linked outcrop",
        description: "Shared station association",
        location: { lat: 0.0012, lng: 0.0032 },
        elevation: 0,
        actionOrderUuids: [poiActionUuid],
      });
      doc.stations[mission.ids.stationB].poiUuids = [poiUuid];
      doc.actions[poiActionUuid] = seedAction({
        uuid: poiActionUuid,
        refUuid: poiActionUuid,
        name: "Mapped POI sample",
        poiUuid,
        type: "sample",
        duration: 8,
        mass: 12,
        enabled: true,
      });
    });
    const arranged = await mission.read();
    expect(
      Object.values(arranged.evas)
        .filter((eva) => eva.sequence.some((item) => item.uuid === mission.ids.stationB))
        .map((eva) => eva.uuid)
        .sort()
    ).toEqual([mission.ids.evaA, mission.ids.evaB].sort());

    await mission.open();
    await enablePlanningEditMode(page);
    await selectStation(page, "Bravo station");

    await cancelPlanningField(page, "Station Description", "Discard this station note");
    expect(await mission.read()).toEqual(arranged);
    const description = 'Survey boundary α & <crater>\nSecond line: "shared"';
    await savePlanningField(page, "Station Description", description);

    // Emoji picker exposes names to assistive technology; choosing the existing
    // palette icon updates the station document through its UI control.
    await page.getByLabelText("Pick Icon", { exact: true }).click();
    const emojiSearch = page.getByPlaceholder("Search", { exact: true });
    await emojiSearch.fill("large orange diamond");
    const glyph = String.fromCodePoint(0x1f536);
    await page.getByRole("button", { name: glyph, exact: true }).click();
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationB].icon)
      .toMatch(/^1f536$/i);
    await expect
      .element(
        page
          .getByLabelText("stationList-item", { exact: true })
          .filter({ hasText: "Bravo station" })
          .getByText(glyph, { exact: true })
      )
      .toBeVisible();
    await expect.poll(async () => (await stationMarker(mission.ids.stationB))?.emoji).toBe("1f536");
    const pageMarker = await stationMarker(mission.ids.stationB);
    expect(pageMarker?.image).toMatch(/^data:image\/png;base64,/);

    await selectPlanningPoi(page, "Bravo linked outcrop");
    await page.getByLabelText("info_panel", { exact: true }).click();
    const poiTotal = (client: Page, label: string) =>
      client
        .getByText(label, { exact: true })
        .getBySelector("../..")
        .getBySelector('[class*="displayFieldValue"]');
    await expect.element(poiTotal(page, "Number of Actions:")).toHaveTextContent(exactText("1"));
    await expect
      .element(poiTotal(page, "Total Action Time (mins):"))
      .toHaveTextContent(exactText("8"));
    await expect.element(poiTotal(page, "Total Mass (g):")).toHaveTextContent(exactText("12"));
    await expect
      .element(poiTotal(page, "Stations using this POI:"))
      .toHaveTextContent(exactText("1"));
    await selectStation(page, "Bravo station");
    const usage = (client: Page) =>
      client
        .getByText("EVAs Using this Station:", { exact: true })
        .getBySelector("../..")
        .getBySelector('[class*="displayFieldValue"]');
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect.element(usage(page)).toHaveTextContent(exactText("2"));
    await expect
      .poll(async () => (await mission.read()).stations[mission.ids.stationB].description)
      .toBe(description);

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

    await mission.open();
    await selectStation(page, "Bravo station");
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect
      .element(planningField(page, "Station Description"))
      .toHaveTextContent(exactText(description));
    await expect.element(usage(page)).toHaveTextContent(exactText("2"));
    await expect
      .poll(() => stationMarker(mission.ids.stationB))
      .toMatchObject({
        emoji: "1f536",
      });
    await selectPlanningPoi(page, "Bravo linked outcrop");
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect.element(poiTotal(page, "Number of Actions:")).toHaveTextContent(exactText("1"));
    await expect
      .element(poiTotal(page, "Total Action Time (mins):"))
      .toHaveTextContent(exactText("8"));
    await expect.element(poiTotal(page, "Total Mass (g):")).toHaveTextContent(exactText("12"));
    await expect
      .element(poiTotal(page, "Stations using this POI:"))
      .toHaveTextContent(exactText("1"));

    await expect.poll(() => stationMarker(mission.ids.stationB)).toEqual(pageMarker);
  });
});
