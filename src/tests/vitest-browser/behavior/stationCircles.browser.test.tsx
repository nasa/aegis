import type { BrowserPage as Page } from "vitest/browser";
import { userEvent } from "vitest/browser";
import type VectorLayer from "ol/layer/Vector";
import type Point from "ol/geom/Point";
import type LineString from "ol/geom/LineString";
import { test, expect } from "./missionHarness";
import { enablePlanningEditMode, selectPlanningStation } from "./planningHelpers";

const circleStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#FFFFFF",
  weight: 1,
  fillColor: "none",
  fillOpacity: 0,
  isDashed: false,
  dashLen: 10,
  altColor: "#FFFFFF",
  altOpacity: 1,
  showLabels: true,
  labelColor: "#ffffff",
  labelHaloColor: "#000000",
  labelHaloWidth: 2,
  labelHaloOpacity: 0.2,
};

async function circlesOnMap(page: Page, stationUuid: string) {
  return ((stationUuid) => {
    const map = window.__aegisMaps?.find(
      (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
    )?.map;
    if (!map) return [];
    const layers = map.getLayers().getArray();
    const stationLayer = layers.find((layer) => layer.getZIndex() === 14) as
      VectorLayer | undefined;
    const stationFeature = stationLayer?.getSource()?.getFeatureById(stationUuid);
    if (!stationFeature) return [];
    const center = (stationFeature.getGeometry() as Point).getCoordinates();
    return layers
      .filter((layer) => layer.getZIndex() === 6 && layer.getVisible())
      .flatMap((layer) => {
        const source = (layer as VectorLayer).getSource();
        return (source?.getFeatures() ?? []).flatMap((feature) => {
          const geometry = feature.getGeometry() as LineString;
          if (geometry.getType() !== "LineString") return [];
          const coordinates = geometry.getCoordinates();
          const xs = coordinates.map((coordinate) => coordinate[0]);
          const ys = coordinates.map((coordinate) => coordinate[1]);
          // Bounding-box midpoint is not biased by the repeated closing vertex.
          const circleCenter = [
            (Math.min(...xs) + Math.max(...xs)) / 2,
            (Math.min(...ys) + Math.max(...ys)) / 2,
          ];
          const centerOffset = Math.hypot(circleCenter[0] - center[0], circleCenter[1] - center[1]);
          const distances = coordinates.map((coordinate) =>
            Math.hypot(coordinate[0] - circleCenter[0], coordinate[1] - circleCenter[1])
          );
          const radius = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
          return [{ centerOffset, radius }];
        });
      });
  })(stationUuid);
}

test("station circle visibility and style stay local and render the defined metre radius", async ({
  page,
  mission,
}) => {
  const circleUuid = crypto.randomUUID();
  const radiusMeters = 350;
  await mission.change((doc) => {
    doc.circleDefinitions = {
      ...(doc.circleDefinitions ?? {}),
      [circleUuid]: { name: "Behavior test radius", radius: radiusMeters },
    };
    for (const stationUuid of [mission.ids.stationA, mission.ids.stationB]) {
      doc.stations[stationUuid].mapCircleControls[circleUuid] = {
        uuid: circleUuid,
        visible: false,
        style: { ...circleStyle },
      };
    }
  });
  const arranged = await mission.read();
  await mission.open();
  await enablePlanningEditMode(page);
  await selectPlanningStation(page, "Alpha station");
  await page.getByLabelText("circle_panel", { exact: true }).click();
  const circleRow = (client: Page) =>
    client
      .getBySelector('[class*="sublayerItemContainer"]')
      .filter({ hasText: "Behavior test radius" });
  await expect.element(circleRow(page)).toBeVisible();
  await circleRow(page).getBySelector('[class*="visibility"]').click();
  await expect
    .poll(
      async () =>
        (await mission.read()).stations[mission.ids.stationA].mapCircleControls[circleUuid].visible
    )
    .toBe(true);
  await expect
    .poll(() => circlesOnMap(page, mission.ids.stationA).then((circles) => circles.length))
    .toBe(1);
  await expect
    .poll(() => circlesOnMap(page, mission.ids.stationA).then((circles) => circles[0].radius))
    .toBeCloseTo(radiusMeters, 1);
  await expect
    .poll(() => circlesOnMap(page, mission.ids.stationA).then((circles) => circles[0].centerOffset))
    .toBeLessThan(1e-4);

  await circleRow(page).getBySelector("svg").last().click();
  const weight = circleRow(page).getByLabelText("weight", { exact: true });
  weight.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(weight).toHaveValue("2");
  await expect
    .poll(
      async () =>
        (await mission.read()).stations[mission.ids.stationA].mapCircleControls[circleUuid].style
          .weight
    )
    .toBe(2);
  await expect
    .poll(
      async () =>
        (await mission.read()).stations[mission.ids.stationB].mapCircleControls[circleUuid]
    )
    .toEqual(arranged.stations[mission.ids.stationB].mapCircleControls[circleUuid]);
  const after = await mission.read();
  expect(after.stations[mission.ids.stationA].mapCircleControls[circleUuid]).toEqual({
    ...arranged.stations[mission.ids.stationA].mapCircleControls[circleUuid],
    visible: true,
    style: { ...circleStyle, weight: 2 },
  });
  expect(after.stations[mission.ids.stationB].mapCircleControls[circleUuid]).toEqual(
    arranged.stations[mission.ids.stationB].mapCircleControls[circleUuid]
  );

  for (const client of [page]) {
    await mission.open();
    await enablePlanningEditMode(client);
    await selectPlanningStation(client, "Alpha station");
    await client.getByLabelText("circle_panel", { exact: true }).click();
    await expect
      .element(circleRow(client).getBySelector('[class*="visible"] svg[data-icon="eye"]'))
      .toBeVisible();
    await circleRow(client).getBySelector("svg").last().click();
    await expect
      .element(circleRow(client).getByLabelText("weight", { exact: true }))
      .toHaveValue("2");
    await expect
      .poll(() => circlesOnMap(client, mission.ids.stationA).then((circles) => circles.length))
      .toBe(1);
    await expect
      .poll(() => circlesOnMap(client, mission.ids.stationA).then((circles) => circles[0].radius))
      .toBeCloseTo(radiusMeters, 1);
  }

  for (const client of [page]) {
    await selectPlanningStation(client, "Bravo station");
    await expect
      .poll(() =>
        circlesOnMap(client, mission.ids.stationB).then((circles) =>
          circles.filter((circle) => circle.centerOffset < 1e-4)
        )
      )
      .toEqual([]);
    await client.getByLabelText("circle_panel", { exact: true }).click();
    await expect.element(circleRow(client).getBySelector('[class*="inVisible"]')).toBeVisible();
  }
  expect(
    (await mission.read()).stations[mission.ids.stationA].mapCircleControls[circleUuid].visible
  ).toBe(true);
});
