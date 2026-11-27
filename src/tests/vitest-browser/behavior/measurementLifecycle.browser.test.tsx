import store from "store";
import { waitForMapIdle } from "./mapInteractions";
import { commands, userEvent } from "vitest/browser";
import type { BrowserPage as Page } from "vitest/browser";
import { test, expect } from "./missionHarness";
import { exactText, isVisible } from "./browserAssertions";
import { measurements, openMeasurements } from "./measurementHelpers";

function view() {
  const map = window.__aegisMaps.find(
    (entry) => entry.mode === "editor" && entry.map.getTargetElement()?.isConnected
  ).map;
  return {
    center: map.getView().getCenter(),
    resolution: map.getView().getResolution(),
    animating: map.getView().getAnimating(),
  };
}
const tabs = (page: Page) => page.getBySelector('[class*="measureTabContainer"]');
test("removing an inactive measurement never selects the deleted tab and leaves the remaining path usable", async ({
  page,
  mission,
}) => {
  await mission.change((doc) => {
    doc.demFilePath = "measurement-tab-deletion.dem";
  });
  const before = await mission.read();
  await mission.open();
  await openMeasurements(page);
  const add = page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]');
  await add.click();
  await expect.poll(() => measurements()).toHaveLength(1);
  const first = measurements()[0];
  await add.click();
  await expect.poll(() => tabs(page).length).toBe(2);
  const secondUuid = store
    .getState()
    .measure.measurements.find(({ uuid }) => uuid !== first.id)!.uuid;
  await expect.poll(() => measurements().map(({ id }) => id)).toEqual([secondUuid]);
  const second = measurements()[0];

  await tabs(page).first().getBySelector('[data-tooltip-content="Remove Measurement"]').click();
  await expect.poll(() => tabs(page).length).toBe(1);
  expect(store.getState().measure.selectedMeasurementUuid).not.toBe(first.id);
  expect(store.getState().measure.measurements.map(({ uuid }) => uuid)).toEqual([second.id]);
  await tabs(page).first().getBySelector('svg[data-icon="ruler"]').click();
  await expect.poll(() => measurements()).toEqual([second]);
  expect(await mission.read()).toEqual(before);
});

for (const zoom of [17, 19]) {
  test(`temporary measurement tabs preserve the map view and stay local through navigation at zoom ${zoom}`, async ({
    page,
    requestHandlers,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.initialZoom = zoom;
    });
    const before = await mission.read();

    await mission.open();
    await openMeasurements(page);
    await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
    await expect.poll(() => tabs(page).length).toBe(1);
    await expect.poll(() => measurements()).toHaveLength(1);
    const first = (await measurements())[0];
    const canvas = page.getBySelector('[data-map-mode="editor"] .ol-viewport');
    await canvas.hover({ position: { x: 150, y: 120 } });
    const oldResolution = (await view()).resolution;
    await commands.mapPointer("wheel", 0, -240);
    await expect.poll(async () => (await view()).resolution).not.toBe(oldResolution);
    await expect.poll(async () => (await view()).animating).toBe(false);
    await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
    await expect.poll(() => tabs(page).length).toBe(2);
    const second = (await measurements())[0];
    expect(second.id).not.toBe(first.id);
    expect(second.coordinates).not.toEqual(first.coordinates);
    const fixedView = await view();
    for (const [index, expected] of [
      [0, first],
      [1, second],
    ] as const) {
      await tabs(page).nth(index).getBySelector('svg[data-icon="ruler"]').click();
      await expect.poll(() => measurements()).toEqual([expected]);
      expect(await view()).toEqual(fixedView);
    }
    await page.getBySelector('[data-tooltip-content="Timeline"]').click();
    await openMeasurements(page);
    await expect.poll(() => tabs(page).length).toBe(2);
    await expect.poll(() => measurements()).toEqual([second]);
    const other = await mission.addMission("Measurement switch");
    requestHandlers["/api/v1/missionHomepageItems"] = () =>
      Response.json({
        status: "success",
        data: [
          { id: mission.id, name: mission.name, runningRex: null },
          { id: other.id, name: other.name, runningRex: null },
        ],
      });
    requestHandlers["/api/v1/version"] = () =>
      Response.json({
        version: __APP_VERSION__,
        gitCommit: __GIT_COMMIT__,
        serverEpochUuid: "browser-test-epoch",
      });
    const name = other.name;
    await page.getBySelector('svg[data-icon="bars"]').click();
    await page
      .getBySelector("tr")
      .filter({ has: page.getByText(name, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect
      .element(page.getByLabelText("missionNameHeader", { exact: true }))
      .toMatchTextContent(exactText(name));
    await openMeasurements(page);
    await expect.poll(() => tabs(page).length).toBe(0);
    await page.getBySelector('svg[data-icon="bars"]').click();
    await page
      .getBySelector("tr")
      .filter({ has: page.getByText(mission.name, { exact: true }) })
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect
      .element(page.getByLabelText("missionNameHeader", { exact: true }))
      .toMatchTextContent(exactText(mission.name));
    await openMeasurements(page);
    await expect.poll(() => tabs(page).length).toBe(0);
    await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
    await expect.poll(() => tabs(page).length).toBe(1);
    await mission.open();
    await openMeasurements(page);
    await expect.poll(() => tabs(page).length).toBe(0);
    expect(await mission.read()).toEqual(before);
  });
}
for (const dismissal of ["Escape", "backdrop"] as const) {
  test(`slope key exposes ranges, shared graph colors and keyboard focus with ${dismissal} dismissal`, async ({
    page,
    requestHandlers,
    mission,
  }) => {
    await mission.change((doc) => {
      doc.demFilePath = "explicit-measure-profile.tif";
    });
    requestHandlers["/api/v1/terrain-profile"] = (_url, init) => {
      const input = JSON.parse(String(init.body)) as TerrainProfilePostData;
      return Response.json({
        status: "success",
        data: {
          elevationsMeters: input.pathSegmentDistances.map(() => [100, 125, 100]),
          terrainSlopesDegrees: input.pathSegmentDistances.map(() => [0, 8, 20]),
        },
      });
    };
    const before = await mission.read();
    await mission.open();
    await openMeasurements(page);
    await page.getBySelector('[data-tooltip-content="Add Temporary Measurement"]').click();
    await expect.poll(() => tabs(page).length).toBe(1);
    const graph = page.getBySelector('[class*="measureCanvasContainer"] canvas');
    await expect
      .poll(() => store.getState().measure.measurements[0]?.pathSegmentElevations)
      .toEqual([[100, 125, 100]]);
    await expect.element(graph).toBeVisible();
    await waitForMapIdle();
    const standardGraph = (graph.element() as HTMLCanvasElement).toDataURL();
    const key = page.getByRole("button", { name: "Key", exact: true });
    key.element().focus();
    await userEvent.keyboard("{Enter}");
    const legend = page.getByRole("dialog", {
      name: "Slope color = absolute degrees",
      exact: true,
    });
    await expect.element(legend).toBeVisible();
    for (const example of ["Path Grade", "Terrain Slope"]) {
      await expect
        .poll(
          () =>
            legend.getByLabelText(`${example} example`, { exact: true }).getBySelector("span")
              .length
        )
        .toBe(24);
    }
    const standardRanges = [
      "0–2°",
      ">2–4°",
      ">4–6°",
      ">6–8°",
      ">8–10°",
      ">10–12°",
      ">12–14°",
      ">14–16°",
      ">16–18°",
      ">18–20°",
      ">20°",
    ];
    for (const label of standardRanges)
      await expect.element(legend.getByText(label, { exact: true })).toBeVisible();
    await expect.element(legend.getByText(/uphill or downhill angle/)).toBeVisible();
    await expect.element(legend.getByText(/regardless of travel direction/)).toBeVisible();
    if (dismissal === "Escape") await userEvent.keyboard("{Escape}");
    else await commands.mapPointer("click", 2, 2);
    await expect.poll(() => isVisible(legend)).toBe(false);
    await expect.element(key).toHaveFocus();
    const mode = page.getByRole("button", { name: "Colorblind", exact: true });
    await expect.element(mode).toHaveAttribute("aria-pressed", "false");
    await mode.click();
    await expect.element(mode).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (graph.element() as HTMLCanvasElement).toDataURL() === standardGraph)
      .toBe(false);
    await key.click();
    const accessibleRanges = ["0–2°", ">2–4°", ">4–8°", ">8–12°", ">12–16°", ">16–20°", ">20°"];
    for (const label of accessibleRanges)
      await expect.element(legend.getByText(label, { exact: true })).toBeVisible();
    await expect.poll(() => legend.getBySelector('[class*="swatch"]').length).toBe(7);
    await legend.getByRole("button", { name: "Close", exact: true }).click();
    await page.getBySelector('[data-tooltip-content="Timeline"]').click();
    await expect.element(mode).toHaveAttribute("aria-pressed", "true");
    await openMeasurements(page);
    await expect.element(mode).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => tabs(page).length).toBe(1);
    expect(await mission.read()).toEqual(before);
  });
}
