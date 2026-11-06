import { commands } from "vitest/browser";
import { vi } from "vitest";
import { waitForMapIdle } from "./mapInteractions";
import { isVisible } from "./browserAssertions";
import type { BrowserPage as Page } from "vitest/browser";
import { test as base, expect } from "./missionHarness";
const test = base;
import { readMapFeatures } from "./mapObserver";
import { selectPlanningPoi, selectPlanningStation } from "./planningHelpers";
import { openExecutionInfo, selectExecution } from "./executionHelpers";

async function selectPlan(page: Page, mission: BrowserMission) {
  await selectExecution(page, "Survey Alpha", mission.ids.evaA);
  if (!(await isVisible(page.getBySelector('div[aria-label="EVA Title"]')))) {
    await page
      .getByLabelText("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" })
      .getByText("Survey Alpha", { exact: true })
      .click();
  }
  await page.getByLabelText("info_panel", { exact: true }).click();
}

async function mapState() {
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
}

test(
  "map pan, controls, double-click and viewport resizing retain one usable editor through remounts",
  { timeout: 40000 },
  async ({ page, mission }) => {
    const before = await mission.read();
    await mission.open();
    await waitForMapIdle();
    const viewport = page.getBySelector('[data-map-mode="editor"] .ol-viewport');
    await expect.poll(async () => (await mapState()).animating).toBe(false);
    const initial = await mapState();
    expect(initial.live).toBe(1);
    const bounds = await viewport.element().getBoundingClientRect();
    await commands.mapPointer("move", bounds.x + 100, bounds.y + 200);
    await commands.mapPointer("down");
    await commands.mapPointer("move", bounds.x + 230, bounds.y + 275, 12);
    await commands.mapPointer("up");
    await expect.poll(async () => (await mapState()).center).not.toEqual(initial.center);
    await expect.poll(async () => (await mapState()).animating).toBe(false);
    const panned = await mapState();
    await page.getBySelector(".ol-zoom-in").click();
    await expect.poll(async () => (await mapState()).zoom).toBeCloseTo(initial.zoom + 1, 3);
    await expect.poll(async () => (await mapState()).animating).toBe(false);
    await page.getBySelector(".ol-zoom-out").click();
    await expect.poll(async () => (await mapState()).zoom).toBeCloseTo(initial.zoom, 3);
    await expect.poll(async () => (await mapState()).animating).toBe(false);
    await viewport.dblClick({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    await expect.poll(async () => (await mapState()).zoom).toBeCloseTo(initial.zoom + 1, 3);
    await expect.poll(async () => (await mapState()).animating).toBe(false);
    const zoomed = await mapState();
    await page.viewport(1500, 900);
    await expect.poll(async () => (await mapState()).size).not.toEqual(initial.size);
    const resized = await mapState();
    expect(resized.center).toEqual(zoomed.center);
    expect(resized.zoom).toEqual(zoomed.zoom);
    expect(panned.zoom).toBe(initial.zoom);
    expect(resized.interactions).toBe(initial.interactions);
    for (let click = 0; click < 15; click++) {
      await page.getBySelector(".ol-zoom-in").click();
      await expect.poll(async () => (await mapState()).animating).toBe(false);
    }
    await expect.poll(async () => (await mapState()).zoom).toBe(28);
    for (let click = 0; click < 32; click++) {
      await page.getBySelector(".ol-zoom-out").click();
      await expect.poll(async () => (await mapState()).animating).toBe(false);
    }
    const minimumZoom = Math.max(0, Math.log2((await mapState()).size[1] / 256));
    await expect.poll(async () => (await mapState()).zoom).toBeCloseTo(minimumZoom, 6);
    for (let index = 0; index < 3; index++) {
      await mission.open();
      await expect.poll(async () => (await mapState()).live).toBe(1);
      await expect
        .poll(
          async () =>
            (await readMapFeatures()).filter(
              (item) => item.id === mission.ids.stationA && item.geometryType === "Point"
            ).length
        )
        .toBe(1);
      expect((await mapState()).interactions).toBe(initial.interactions);
      await page.getBySelector(".ol-zoom-in").click();
      await expect.poll(async () => (await mapState()).zoom).toBeCloseTo(before.initialZoom + 1, 3);
    }
    expect(await mission.read()).toEqual(before);
  }
);

test.describe("QuickMap UI handoffs", () => {
  const test = base.extend({ scenario: "execution" as BehavioralScenario });
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
    await vi.spyOn(window, "open").mockImplementation((url) => {
      document.documentElement.dataset.quickMapUrl = String(url);
      return null;
    });
    await mission.open();
    const handoff = async (label: string) => {
      const button = page.getByLabelText(label, { exact: true });
      await expect.element(button).toBeEnabled();
      await button.click();
      const url = new URL(document.documentElement.dataset.quickMapUrl);
      expect(url.origin).toBe("https://quickmap.lroc.im-ldi.com");
      expect(url.searchParams.get("proj")).toBe("22");
      expect(url.searchParams.get("resolution")).toBe("5");
      expect(url.searchParams.get("stack")).toBe("66,3921");
      return url.searchParams;
    };
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("info_panel", { exact: true }).click();
    const poi = await handoff("View POI in QuickMap");
    expect(poi.get("center")).toBe("0.002,0.0015");
    expect(poi.get("features")).toBe(
      '0,0@@{"properties":{"title":"Lander","marker-color":"#ffffff"}}|0.002,0.0015@@{"properties":{"title":"Reference POI"}}'
    );
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
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
      .getByLabelText("evaList-item", { exact: true })
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
    await expect
      .element(page.getByLabelText("View Crew Positions in QuickMap", { exact: true }))
      .toHaveClass(/buttonDisabled/);
    await selectPlanningPoi(page, "Reference POI");
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect
      .element(page.getByLabelText("View POI in QuickMap", { exact: true }))
      .toHaveClass(/buttonDisabled/);
    await selectPlanningStation(page, "Alpha station");
    await page.getByLabelText("info_panel", { exact: true }).click();
    await expect
      .element(page.getByLabelText("View Station in QuickMap", { exact: true }))
      .toHaveClass(/buttonDisabled/);
    await selectPlan(page, mission);
    await expect
      .element(page.getByLabelText("View EVA in QuickMap", { exact: true }))
      .toHaveClass(/buttonDisabled/);
    await page
      .getByLabelText("evaList-item", { exact: true })
      .filter({ hasText: "Survey Alpha" })
      .getByText("Alpha to Bravo", { exact: true })
      .click();
    await expect
      .element(page.getByLabelText("View Traverse in QuickMap", { exact: true }))
      .toHaveClass(/buttonDisabled/);
    const after = await mission.read();
    expect(after.evas).toEqual(before.evas);
    expect(after.actions).toEqual(before.actions);
  });
});
