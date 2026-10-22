import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { useSyncExternalStore } from "react";
import { Provider } from "react-redux";
import { page } from "vitest/browser";
import EvaSunEarth from "components/panes/eva/eva-sun-earth";
import { SunEarth } from "components/interface/map/overlays/map-sunearth";
import { evaSlice, setSelectedEvaUuid } from "store/eva";
import { hoverSlice, setSequenceHover, clearMapItemHover } from "store/hover";
import { generateBlankEVA } from "store/storeUtils/eva";
import {
  connectionSlice,
  setSocketConnectionStatus,
  setAutomergeConnectionStatus,
} from "store/connection";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import "styles/globals.css";

let mission: Partial<Mission>;
const missionListeners = new Set<() => void>();
function updateMission(change: (doc: Mission) => void) {
  mission = structuredClone(mission);
  change(mission as Mission);
  missionListeners.forEach((listener) => listener());
}
vi.mock("client/automergeDocHandles", () => ({
  withMissionChange: (change: (doc: Mission) => void) => updateMission(change),
}));
vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (doc: Partial<Mission>) => unknown) =>
    selector(
      useSyncExternalStore(
        (listener) => {
          missionListeners.add(listener);
          return () => {
            missionListeners.delete(listener);
          };
        },
        () => mission
      )
    ),
}));

const makeStore = () =>
  configureStore({
    reducer: {
      eva: evaSlice.reducer,
      connection: connectionSlice.reducer,
      hover: hoverSlice.reducer,
    },
  });
let store: ReturnType<typeof makeStore>;
let harness: ReactHarness;
function Editor({ editMode }: { editMode: boolean }) {
  const doc = useSyncExternalStore(
    (listener) => {
      missionListeners.add(listener);
      return () => {
        missionListeners.delete(listener);
      };
    },
    () => mission
  );
  return <EvaSunEarth eva={doc.evas["eva-1"]} editMode={editMode} />;
}
function render(editMode = true) {
  harness.render(
    <Provider store={store}>
      <Editor editMode={editMode} />
      <SunEarth type="editor" />
    </Provider>
  );
}
beforeEach(() => {
  mission = {
    evas: {
      "eva-1": generateBlankEVA({ uuid: "eva-1", datetime: Date.parse("2026-04-15T12:00:00Z") }),
    },
    planetRadius: 1737400,
    landerLocation: { lat: -84.2, lng: 33.5 },
    landerElevationMeters: 5414,
    projIsCustom: true,
    projProj4String: "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +a=1737400 +b=1737400 +units=m +no_defs",
  };
  store = makeStore();
  store.dispatch(setSelectedEvaUuid("eva-1"));
  store.dispatch(setSocketConnectionStatus("connected"));
  store.dispatch(setAutomergeConnectionStatus("connected"));
  harness = createReactHarness();
  harness.container.style.width = "420px";
});
afterEach(() => harness.unmount());
const info = () =>
  harness.container.querySelector('[aria-label$="value source"]')?.getAttribute("aria-description");
describe("EVA Sun/Earth", () => {
  it("defaults to calculating from the EVA date with both indicators and no enable checkboxes", () => {
    render();
    expect(harness.container.querySelector<HTMLInputElement>('input[type="radio"]')?.checked).toBe(
      true
    );
    expect(info()).toContain("2026-04-15T12:00:00");
    expect(harness.container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(harness.container.querySelectorAll('[data-icon="sun"]')).toHaveLength(3);
    expect(harness.container.querySelectorAll('[data-icon="earth-americas"]')).toHaveLength(2);
  });
  it("keeps the tooltip at EVA start while directions follow timeline hover", async () => {
    mission.evas["eva-1"].name = "EVA 1";
    render();
    const startInfo = info();
    expect(startInfo).toContain("Calculated at EVA start:");
    expect(startInfo).toContain("2026-04-15T12:00:00");
    const sunIcon = harness.container.querySelectorAll('[data-icon="sun"]')[2]
      .parentElement as HTMLElement;
    const startPosition = sunIcon.style.cssText;

    store.dispatch(
      setSequenceHover({
        sequenceUuid: null,
        sequenceItemPercentElapsed: null,
        mapItemType: null,
        timelineTime: { evaUuid: "eva-1", elapsedSeconds: 21600 },
      })
    );
    await vi.waitFor(() => {
      expect(sunIcon.style.cssText).not.toBe(startPosition);
      expect(info()).toBe(startInfo);
    });

    store.dispatch(clearMapItemHover());
    await vi.waitFor(() => {
      expect(sunIcon.style.cssText).toBe(startPosition);
      expect(info()).toBe(startInfo);
    });
  });
  it("persists manual mode and directions on the EVA", async () => {
    render();
    await page.getByRole("radio", { name: "Set manually" }).click();
    expect(mission.evas["eva-1"].sunEarthFromDate).toBe(false);
    await page.getByLabelText("Sun azimuth", { exact: true }).last().click();
    await page.getByRole("textbox", { name: "Sun azimuth", exact: true }).fill("123");
    await page.getByRole("dialog").getByText("Save", { exact: true }).click();
    await vi.waitFor(() => expect(mission.evas["eva-1"].sunAzimuth).toBe(123));
    expect(info()).toBe("Manual EVA directions");
  });
  it("explains why calculation is unavailable off the Moon and permits manual mode", async () => {
    mission.planetRadius = 6371000;
    render();
    expect(info()).toContain("not on the Moon");
    expect(harness.container.querySelectorAll('[data-icon="moon"]')).toHaveLength(2);
    expect(harness.container.querySelectorAll('[data-icon="earth-americas"]')).toHaveLength(0);
    await page.getByRole("radio", { name: "Set manually" }).click();
    expect(info()).toBe("Manual EVA directions");
    await expect.element(page.getByLabelText("Moon azimuth", { exact: true }).last()).toBeVisible();
    updateMission((doc) => {
      doc.planetRadius = 1737400;
    });
    await expect
      .element(page.getByLabelText("Earth azimuth", { exact: true }).last())
      .toBeVisible();
    expect(harness.container.querySelectorAll('[data-icon="earth-americas"]')).toHaveLength(2);
    expect(harness.container.querySelectorAll('[data-icon="moon"]')).toHaveLength(0);
  });
  it("greys out with an explanation when no EVA is selected", () => {
    store.dispatch(setSelectedEvaUuid(null));
    render();
    expect(info()).toBe("No EVA selected.");
    const overlay = harness.container.querySelector(
      '[aria-label="Sun/Earth value source"]'
    ).parentElement;
    expect(getComputedStyle(overlay).filter).toBe("grayscale(1)");
  });
  it("does not substitute a layer date for a missing EVA date", () => {
    mission.evas["eva-1"].datetime = null;
    render();
    expect(info()).toBe("The selected EVA has no valid start date.");
  });
  it("shows the direction source instead of radio controls in read-only mode", async () => {
    render(false);
    expect(harness.container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    await expect.element(page.getByText("Calculated from EVA date", { exact: true })).toBeVisible();
    updateMission((doc) => {
      doc.evas["eva-1"].sunEarthFromDate = false;
    });
    await expect.element(page.getByText("Manually set", { exact: true })).toBeVisible();
    expect(harness.container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });
});
