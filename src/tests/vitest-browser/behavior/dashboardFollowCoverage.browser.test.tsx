import { exactText } from "./browserAssertions";
import { commands } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
import { seedPosEntry } from "tests/playwright/fixtures/entitySeeds";
import { readMapFeatures } from "./mapObserver";

const test = base.extend({ scenario: "execution" as BehavioralScenario });
const extraSource = "30000000-0000-4000-8000-000000009007";
const project = (point: AEGISPoint) => [
  (point.lng * Math.PI * 6378137) / 180,
  Math.log(Math.tan(Math.PI / 4 + (point.lat * Math.PI) / 360)) * 6378137,
];

async function dashboardView(page: Page, mode: "dashboard" | "minimap" = "dashboard") {
  const map = window.__aegisMaps.find(
    (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
  )?.map;
  return {
    center: map?.getView().getCenter(),
    animating: map?.getView().getAnimating(),
    extent: map?.getView().calculateExtent(map.getSize()),
  };
}

async function followOptions(page: Page) {
  const map = page.getBySelector('[data-map-mode="dashboard"]');
  await commands.mapPointer("move", 0, 0);
  await map.hover();
  await map.getByText("Select Items to Follow", { exact: true }).click();
  return map.getBySelector('[class*="multiselectDropdownItems_"]');
}

async function followChoice(page: Page, label: string, selected: boolean) {
  const options = await followOptions(page);
  const row = options
    .getBySelector('[class*="multiselectDropdownItem_"]')
    .filter({ has: page.getByText(label, { exact: true }) });
  await expect.element(row).toBeVisible();
  const checked = (await row.getBySelector('svg[data-icon="square-check"]').length) > 0;
  if (checked !== selected) await row.click();
  await page.getByText("Select Items to Follow", { exact: true }).click();
}

async function expectCenter(page: Page, point: AEGISPoint) {
  await expect.poll(async () => (await dashboardView(page)).animating).toBe(false);
  await expect
    .poll(async () => (await dashboardView(page)).center)
    .toEqual(project(point).map((value) => expect.closeTo(value, 3)));
}

test("dashboard follows newest source-filtered positions and independently selected active stations and traverses", async ({
  page,
  mission,
}) => {
  const old = { lat: 0.1, lng: 0.1 };
  const crew = { lat: 0.002, lng: 0.004 };
  const task = { lat: 0.003, lng: 0.006 };
  await mission.change((doc) => {
    const rex = doc.rexes[mission.ids.rexB];
    rex.posSources.push({ uuid: extraSource, name: "Task", abbr: "T", pathColor: "#0088ff" });
    rex.posEntries = [
      seedPosEntry({
        uuid: mission.ids.posB,
        location: old,
        createdAt: 100,
        petSeconds: 100,
        posTypeUuids: [mission.ids.posType],
        posSourceUuid: mission.ids.posSource,
      }),
      seedPosEntry({
        uuid: "30000000-0000-4000-8000-000000009008",
        location: task,
        createdAt: 300,
        petSeconds: 300,
        posTypeUuids: [mission.ids.posType],
        posSourceUuid: extraSource,
      }),
      seedPosEntry({
        uuid: "30000000-0000-4000-8000-000000009009",
        location: crew,
        createdAt: 200,
        petSeconds: 200,
        posTypeUuids: [mission.ids.posType],
        posSourceUuid: mission.ids.posSource,
      }),
    ];
  });
  const before = await mission.read();
  await mission.openDashboard();
  await expect
    .element(page.getByTestId("dashboard-pet-clock"))
    .toHaveTextContent(exactText("+00:05:00"));
  await followChoice(page, "Stations", false);
  await followChoice(page, "Traverses", false);
  await expectCenter(page, task);
  await expect.poll(async () => (await dashboardView(page, "minimap")).animating).toBe(false);
  const mini = (await dashboardView(page, "minimap")).extent;
  for (const point of [old, before.stations[mission.ids.rexStationB].location]) {
    const [x, y] = project(point);
    expect(x).toBeGreaterThanOrEqual(mini[0]);
    expect(x).toBeLessThanOrEqual(mini[2]);
    expect(y).toBeGreaterThanOrEqual(mini[1]);
    expect(y).toBeLessThanOrEqual(mini[3]);
  }
  await expect
    .poll(async () =>
      (await readMapFeatures("minimap"))
        .filter((feature) => feature.layerZIndex === 14 && feature.visible)
        .map((feature) => feature.id)
    )
    .toEqual([mission.ids.rexStationB]);
  const map = page.getBySelector('[data-map-mode="dashboard"]');
  await map.hover();
  await map.getBySelector('svg[data-icon="eye"]').first().click();
  const sources = map.getBySelector('[class*="toggleMenuItemRow_"]').filter({ hasText: "Sources" });
  await sources.getBySelector('[data-tooltip-content="Task"]').click();
  await expectCenter(page, crew);
  await sources.getByText("All", { exact: true }).click();
  await expectCenter(page, task);
  await map.getBySelector('svg[data-icon="eye"]').first().click();
  await followChoice(page, "EV1", false);
  await followChoice(page, "Stations", true);
  await expectCenter(page, before.stations[mission.ids.rexStationB].location);
  await followChoice(page, "Stations", false);
  await mission.change((doc) => {
    doc.rexes[mission.ids.rexB].traverseEntries[mission.ids.rexTraverseB] = {
      rexStatus: "in-progress",
    };
  });
  await followChoice(page, "Traverses", true);
  const path = before.traverses[mission.ids.rexTraverseB].path.map(project);
  const expected = [
    (Math.min(...path.map((p) => p[0])) + Math.max(...path.map((p) => p[0]))) / 2,
    (Math.min(...path.map((p) => p[1])) + Math.max(...path.map((p) => p[1]))) / 2,
  ];
  await expect
    .poll(async () => (await dashboardView(page)).center)
    .toEqual(expected.map((value) => expect.closeTo(value, 3)));
  await map.getByText("Auto Pan/Zoom Map", { exact: true }).click();
  const fixed = await dashboardView(page);
  await followChoice(page, "EV1", true);
  expect((await dashboardView(page)).center).toEqual(fixed.center);
  const after = await mission.read();
  expect(after.rexes[mission.ids.rexB].posEntries).toEqual(
    before.rexes[mission.ids.rexB].posEntries
  );
  expect(after.evas).toEqual(before.evas);
});
