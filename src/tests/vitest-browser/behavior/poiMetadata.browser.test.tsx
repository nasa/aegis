import { userEvent } from "vitest/browser";
import { exactText } from "./browserAssertions";
import type VectorLayer from "ol/layer/Vector";
import type Icon from "ol/style/Icon";
import { test, expect } from "./missionHarness";

import {
  cancelPlanningField,
  enablePlanningEditMode,
  openPlanningField,
  planningField,
  savePlanningField,
  selectPlanningPoi,
} from "./planningHelpers";

function poiMarker(uuid: string) {
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
}

test.describe("POI metadata contracts", () => {
  for (const variant of ["multiline", "empty"] as const) {
    test(`POI ${variant} descriptions persist exactly while canceled drafts preserve associations`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      const description =
        variant === "empty" ? "" : 'Ridge α & <sample>\nSecond line: "ice" / regolith';
      await mission.open();
      await enablePlanningEditMode(page);
      await selectPlanningPoi(page, "Reference POI");
      await page.getByLabelText("info_panel", { exact: true }).click();
      // Cancellation preserves document values and related entities.
      await cancelPlanningField(page, "POI Description", "Discarded before save");
      expect(await mission.read()).toEqual(before);
      await savePlanningField(page, "POI Description", description);

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

      await mission.open();
      await selectPlanningPoi(page, "Reference POI");
      await page.getByLabelText("info_panel", { exact: true }).click();
      await expect
        .element(planningField(page, "POI Description"))
        .toHaveTextContent(exactText(description));

      await enablePlanningEditMode(page);
      const editor = await openPlanningField(page, "POI Description");
      await expect
        .element(editor.getByLabelText("POI Description", { exact: true }))
        .toHaveValue(description);
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
    test(`every supported POI ${shape} icon updates the list, detail and rendered map and survives remount`, async ({
      page,
      mission,
    }) => {
      const before = await mission.read();
      await mission.open();
      await enablePlanningEditMode(page);
      await selectPlanningPoi(page, "Reference POI");
      const dropdown = page.getBySelector('[class*="iconDropdownContainer"]');
      const images = new Set<string>();
      for (const icon of icons) {
        const glyph = String.fromCodePoint(parseInt(icon, 16));
        await dropdown.click();
        const options = dropdown.getBySelector('[class*="iconDropdownModalList"]');
        await options.getByText(glyph, { exact: true }).click();
        await expect.poll(() => options.length).toBe(0);
        await expect
          .poll(async () => (await mission.read()).pois[mission.ids.poiA].icon)
          .toBe(icon);

        await expect
          .element(page.getByLabelText("poiList-item").getByText(glyph, { exact: true }))
          .toBeVisible();
        await expect
          .element(page.getBySelector('[class*="iconDropdownContainer"]'))
          .toHaveTextContent(exactText(glyph));
        await expect.poll(async () => (await poiMarker(mission.ids.poiA))?.emoji).toBe(icon);

        const marker = await poiMarker(mission.ids.poiA);
        expect(marker.image).toMatch(/^data:image\/png;base64,/);

        expect(
          images.has(marker.image),
          "Each different icon must produce different map pixels"
        ).toBe(false);
        images.add(marker.image);
      }
      // Opening and blurring the menu does not choose an icon.
      await dropdown.click();
      dropdown.element().focus();
      await userEvent.tab();
      await expect
        .poll(() => dropdown.getBySelector('[class*="iconDropdownModalList"]').length)
        .toBe(0);
      const after = await mission.read();
      expect(after.pois[mission.ids.poiA]).toEqual({
        ...before.pois[mission.ids.poiA],
        icon: icons.at(-1),
        updatedAt: expect.any(Number),
      });
      for (const key of ["stations", "actions", "evas", "traverses", "folders"] as const) {
        expect(after[key]).toEqual(before[key]);
      }
      const savedMarker = await poiMarker(mission.ids.poiA);

      await mission.open();
      await selectPlanningPoi(page, "Reference POI");
      await expect.poll(async () => (await poiMarker(mission.ids.poiA))?.emoji).toBe(icons.at(-1));
      await expect.poll(() => poiMarker(mission.ids.poiA)).toEqual(savedMarker);
      await expect
        .element(
          page
            .getByLabelText("poiList-item")
            .getByText(String.fromCodePoint(parseInt(icons.at(-1), 16)), { exact: true })
        )
        .toBeVisible();
    });
  }
});
