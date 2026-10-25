import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/behavioralTest";
import { readMapFeatures } from "../fixtures/mapAssertions";
import { selectPlanningPoi, selectPlanningStation } from "./planningHelpers";
import { openExecutionInfo, selectExecution } from "./executionHelpers";

async function selectPlan(page: Page, mission: BehavioralMission) {
  await selectExecution(page, "Survey Alpha", mission.ids.evaA);
  if (!(await page.locator('div[aria-label="EVA Title"]').isVisible())) {
    await page
      .getByLabel("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" })
      .getByText("Survey Alpha", { exact: true })
      .click();
  }
  await page.getByLabel("info_panel", { exact: true }).click();
}

async function mapState(page: Page) {
  return page.evaluate(() => {
    const maps = window.__aegisMaps.filter((entry) => entry.map.getTargetElement()?.isConnected);
    const map = maps.find((entry) => entry.mode === "editor")?.map;
    return {
      live: maps.length,
      center: map?.getView().getCenter(),
      zoom: map?.getView().getZoom(),
      animating: map?.getView().getAnimating(),
      size: map?.getSize(),
      interactions: map?.getInteractions().getLength(),
    };
  });
}

test("map pan, controls, double-click and viewport resizing retain one usable editor through remounts", async ({
  page,
  mission,
}) => {
  const before = await mission.read();
  await mission.open(page);
  const viewport = page.locator('[data-map-mode="editor"] .ol-viewport');
  await expect.poll(async () => (await mapState(page)).animating).toBe(false);
  const initial = await mapState(page);
  expect(initial.live).toBe(1);
  const bounds = await viewport.boundingBox();
  await page.mouse.move(bounds.x + 100, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 230, bounds.y + 275, {
    steps: 12,
  });
  await page.mouse.up();
  await expect.poll(async () => (await mapState(page)).center).not.toEqual(initial.center);
  await expect.poll(async () => (await mapState(page)).animating).toBe(false);
  const panned = await mapState(page);
  await page.locator(".ol-zoom-in").click();
  await expect.poll(async () => (await mapState(page)).zoom).toBeCloseTo(initial.zoom + 1, 3);
  await expect.poll(async () => (await mapState(page)).animating).toBe(false);
  await page.locator(".ol-zoom-out").click();
  await expect.poll(async () => (await mapState(page)).zoom).toBeCloseTo(initial.zoom, 3);
  await expect.poll(async () => (await mapState(page)).animating).toBe(false);
  await viewport.dblclick({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect.poll(async () => (await mapState(page)).zoom).toBeCloseTo(initial.zoom + 1, 3);
  await expect.poll(async () => (await mapState(page)).animating).toBe(false);
  const zoomed = await mapState(page);
  await page.setViewportSize({ width: 1500, height: 900 });
  await expect.poll(async () => (await mapState(page)).size).not.toEqual(initial.size);
  const resized = await mapState(page);
  expect(resized.center).toEqual(zoomed.center);
  expect(resized.zoom).toEqual(zoomed.zoom);
  expect(panned.zoom).toBe(initial.zoom);
  expect(resized.interactions).toBe(initial.interactions);
  for (let click = 0; click < 15; click++) {
    await page.locator(".ol-zoom-in").click();
    await expect.poll(async () => (await mapState(page)).animating).toBe(false);
  }
  await expect.poll(async () => (await mapState(page)).zoom).toBe(28);
  for (let click = 0; click < 32; click++) {
    await page.locator(".ol-zoom-out").click();
    await expect.poll(async () => (await mapState(page)).animating).toBe(false);
  }
  const minimumZoom = Math.max(0, Math.log2((await mapState(page)).size[1] / 256));
  await expect.poll(async () => (await mapState(page)).zoom).toBeCloseTo(minimumZoom, 6);
  for (let index = 0; index < 3; index++) {
    await page.goto("/");
    await mission.open(page);
    await expect.poll(async () => (await mapState(page)).live).toBe(1);
    await expect
      .poll(
        async () =>
          (await readMapFeatures(page)).filter(
            (item) => item.id === mission.ids.stationA && item.geometryType === "Point"
          ).length
      )
      .toBe(1);
    expect((await mapState(page)).interactions).toBe(initial.interactions);
    await page.locator(".ol-zoom-in").click();
    await expect
      .poll(async () => (await mapState(page)).zoom)
      .toBeCloseTo(before.initialZoom + 1, 3);
  }
  expect(await mission.read()).toEqual(before);
});

test.describe("QuickMap UI handoffs", () => {
  test.use({ scenario: "execution" });
  test("POI, station, traverse, EVA and crew handoffs encode known geometry, colors and time and gate missing locations", async ({
    page,
    mission,
  }) => {
    const date = Date.parse("2028-08-04T12:30:00Z");
    await mission.change((doc) => {
      doc.evas[mission.ids.evaA].datetime = date;
      doc.evas[mission.ids.evaA].traverseColor = "#123456";
      doc.traverses[mission.ids.traverseA].color = "#abcdef";
      doc.rexes[mission.ids.rexB].posEntries.push({
        ...JSON.parse(JSON.stringify(doc.rexes[mission.ids.rexB].posEntries[0])),
        uuid: "30000000-0000-4000-8000-000000007019",
        location: { lat: 0.004, lng: 0.005 },
        petSeconds: 240,
        createdAt: date,
      });
    });
    const before = await mission.read();
    await page.addInitScript(() => {
      window.open = (url) => {
        document.documentElement.dataset.quickMapUrl = String(url);
        return null;
      };
    });
    await mission.open(page);
    const handoff = async (label: string) => {
      const button = page.getByLabel(label, { exact: true });
      await expect(button).toBeEnabled();
      await button.click();
      const url = new URL(await page.locator("html").getAttribute("data-quick-map-url"));
      expect(url.origin).toBe("https://quickmap.lroc.im-ldi.com");
      expect(url.searchParams.get("proj")).toBe("22");
      expect(url.searchParams.get("resolution")).toBe("5");
      expect(url.searchParams.get("stack")).toBe("66,3921");
      return url.searchParams;
    };
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("info_panel", { exact: true }).click();
    const poi = await handoff("View POI in QuickMap");
    expect(poi.get("center")).toBe("0.002,0.0015");
    expect(poi.get("features")).toBe(
      '0,0@@{"properties":{"title":"Lander","marker-color":"#ffffff"}}|0.002,0.0015@@{"properties":{"title":"Reference POI"}}'
    );
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    const station = await handoff("View Station in QuickMap");
    expect(station.get("center")).toBe("0.001,0.001");
    expect(station.get("features")).toBe(
      '0,0@@{"properties":{"title":"Lander","marker-color":"#ffffff"}}|0.001,0.001@@{"properties":{"title":"Alpha station"}}'
    );
    await selectPlan(page, mission);
    const eva = await handoff("View EVA in QuickMap");
    expect(eva.get("center")).toBe("0,0");
    expect(eva.get("time")).toBe("2028-08-04T12:30:00.000Z");
    const features = eva.get("features").split("|");
    expect(features).toHaveLength(8);
    const expectedFeatures = ['0,0@@{"properties":{"title":"Lander","marker-color":"#ffffff"}}'];
    for (const item of before.evas[mission.ids.evaA].sequence) {
      if (item.type === "station") {
        const station = before.stations[item.uuid];
        expectedFeatures.push(
          `${station.location.lng},${station.location.lat}@@${JSON.stringify({ properties: { title: station.name } })}`
        );
      } else {
        const traverse = before.traverses[item.uuid];
        expectedFeatures.push(
          `${traverse.path.map((point) => `${point.lng},${point.lat}`).join(",")}@@${JSON.stringify({ properties: { title: traverse.name, stroke: traverse.color || "#123456", "stroke-width": "3" } })}`
        );
      }
    }
    expect(features).toEqual(expect.arrayContaining(expectedFeatures));
    expect(features).toContain(
      '0,0,0.001,0.001@@{"properties":{"title":"Lander to Alpha","stroke":"#123456","stroke-width":"3"}}'
    );
    await page
      .getByLabel("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" })
      .getByText("Alpha to Bravo", { exact: true })
      .click();
    const traverse = await handoff("View Traverse in QuickMap");
    expect(traverse.get("features")).toBe(
      '0,0@@{"properties":{"title":"Lander","marker-color":"#ffffff"}}|0.001,0.001,0.002,0.0015,0.003,0.001@@{"properties":{"title":"Alpha to Bravo","stroke":"#abcdef","stroke-width":"3"}}'
    );
    expect(traverse.get("center")).toBe("0.001,0.001");
    await openExecutionInfo(page, "Survey Bravo", mission.ids.rexEvaB);
    const positions = await handoff("View Crew Positions in QuickMap");
    expect(positions.get("center")).toBe("0.005,0.004");
    expect(positions.get("features").split("|")).toHaveLength(4);
    expect(positions.get("features").split("|")).toEqual([
      '0,0@@{"properties":{"title":"Lander","marker-color":"#ffffff"}}',
      '0.0025,0.001,0.005,0.004@@{"properties":{"title":"EV1","stroke":"#ff0000","stroke-width":"3"}}',
      '0.0025,0.001@@{"properties":{"title":"EV1","marker-symbol":"circle","marker-color":"#ff0000"}}',
      '0.005,0.004@@{"properties":{"title":"EV1","marker-symbol":"circle","marker-color":"#ff0000"}}',
    ]);
    expect(positions.get("features")).toContain(
      '"marker-symbol":"circle","marker-color":"#ff0000"'
    );
    await mission.change((doc) => {
      doc.landerLocation = { lat: null, lng: null };
      doc.pois[mission.ids.poiA].location = { lat: null, lng: null };
      doc.stations[mission.ids.stationA].location = { lat: null, lng: null };
      doc.traverses[mission.ids.traverseA].path = [];
      doc.rexes[mission.ids.rexB].posEntries = [];
    });
    await expect(page.getByLabel("View Crew Positions in QuickMap", { exact: true })).toHaveClass(
      /buttonDisabled/
    );
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect(page.getByLabel("View POI in QuickMap", { exact: true })).toHaveClass(
      /buttonDisabled/
    );
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabel("info_panel", { exact: true }).click();
    await expect(page.getByLabel("View Station in QuickMap", { exact: true })).toHaveClass(
      /buttonDisabled/
    );
    await selectPlan(page, mission);
    await expect(page.getByLabel("View EVA in QuickMap", { exact: true })).toHaveClass(
      /buttonDisabled/
    );
    await page
      .getByLabel("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" })
      .getByText("Alpha to Bravo", { exact: true })
      .click();
    await expect(page.getByLabel("View Traverse in QuickMap", { exact: true })).toHaveClass(
      /buttonDisabled/
    );
    const after = await mission.read();
    expect(after.evas).toEqual(before.evas);
    expect(after.actions).toEqual(before.actions);
  });
});
