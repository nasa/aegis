import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { useSyncExternalStore } from "react";
import { Provider } from "react-redux";
import { page } from "vitest/browser";
import AzimuthPanel from "components/panes/preset/preset-right-azimuth";
import { SunEarth } from "components/interface/map/overlays/map-sunearth";
import { presetSlice, setSelectedPresetUuid } from "store/preset";
import { generateBlankPreset } from "store/storeUtils/preset";
import {
  connectionSlice,
  setSocketConnectionStatus,
  setAutomergeConnectionStatus,
} from "store/connection";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";
import "styles/globals.css";

let mapDatetime: string | null;
let dateSourceLabel: string;
let dateSource: MapDateTimeWithSource["source"];
let dateWarning: string | null;
let evaWarning: string | null;
let mission: Partial<Mission>;

const missionListeners = new Set<() => void>();
function updateMission(change: (doc: Mission) => void) {
  mission = structuredClone(mission);
  change(mission as Mission);
  missionListeners.forEach((listener) => listener());
}
function upsertTestPreset(value: Preset) {
  updateMission((doc) => {
    doc.presets[value.uuid] = value;
  });
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
vi.mock("components/interface/map/hooks/useMapDateTime", () => ({
  useMapDateTimeWithSource: () => ({
    datetime: mapDatetime,
    sourceLabel: dateSourceLabel,
    source: dateSource,
    warning: dateWarning,
    evaWarning,
  }),
}));

const makeStore = () =>
  configureStore({ reducer: { preset: presetSlice.reducer, connection: connectionSlice.reducer } });
let store: ReturnType<typeof makeStore>;
let harness: ReactHarness;
let preset: Preset;

function render(editMode = true) {
  harness.render(
    <Provider store={store}>
      <AzimuthPanel editMode={editMode} />
    </Provider>
  );
}

function renderMap(type: "editor" | "dashboard" = "editor") {
  harness.render(
    <Provider store={store}>
      <SunEarth type={type} selectedPreset={preset} />
    </Provider>
  );
}

async function openSourceTooltip() {
  const button = harness.container.querySelector<HTMLButtonElement>(
    '[aria-label="Sun/Earth value source"]'
  );
  button.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })
  );
  await vi.waitFor(() =>
    expect(
      document.querySelector('[role="tooltip"]')?.classList.contains("react-tooltip__show")
    ).toBe(true)
  );
  return document.querySelector<HTMLElement>('[role="tooltip"]');
}

beforeEach(() => {
  mapDatetime = "2028-08-04T22:00:00Z";
  dateSourceLabel = "Selected EVA: EVA 1";
  dateSource = "eva";
  dateWarning = null;
  evaWarning = null;
  mission = {
    presets: {},
    landerLocation: { lat: -84.223397, lng: 33.5021945 },
    landerElevationMeters: 5414.891,
    planetRadius: 1737400,
    projIsCustom: true,
    projEpsg: "AEGIS:unregistered-preset-test",
    projProj4String: "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +a=1737400 +b=1737400 +units=m +no_defs",
  };
  store = makeStore();
  store.dispatch(setSocketConnectionStatus("connected"));
  store.dispatch(setAutomergeConnectionStatus("connected"));
  preset = generateBlankPreset({
    sunAzimuth: 123,
    earthAzimuth: 234,
    sunEnabled: true,
    earthEnabled: true,
  });
  upsertTestPreset(preset);
  store.dispatch(setSelectedPresetUuid(preset.uuid));
  harness = createReactHarness();
  harness.container.style.width = "360px";
  harness.container.style.height = "600px";
  harness.container.style.display = "flex";
  harness.container.style.flexDirection = "column";
  harness.container.style.color = "white";
  harness.container.style.position = "relative";
});

afterEach(() => harness.unmount());

describe("Preset Sun/Earth direction", () => {
  it.each(["editor", "dashboard"] as const)(
    "places a color-coded info icon below the indicators at bottom right on the %s map",
    async (type) => {
      preset = { ...preset, sunEarthFromDate: true };
      renderMap(type);
      const button = harness.container.querySelector<HTMLButtonElement>("button");
      const info = button.querySelector("svg");
      const sun = harness.container.querySelector('svg[data-icon="sun"]');
      expect(button.textContent).toBe("");
      expect(button.querySelectorAll("svg")).toHaveLength(1);
      expect(info.getAttribute("data-icon")).toBe("circle-info");
      expect(info.getBoundingClientRect().width).toBeLessThan(sun.getBoundingClientRect().width);
      expect(info.getBoundingClientRect().width).toBeGreaterThan(
        sun.getBoundingClientRect().width * 0.75
      );
      const bounds = button.parentElement.getBoundingClientRect();
      const buttonBounds = button.getBoundingClientRect();
      const earthBounds = harness.container
        .querySelector('svg[data-icon="earth-americas"]')
        .getBoundingClientRect();
      expect(buttonBounds.top).toBeGreaterThan(earthBounds.bottom);
      expect(bounds.right - buttonBounds.right).toBeLessThan(12);
      expect(bounds.bottom - buttonBounds.bottom).toBeLessThan(12);
      expect(getComputedStyle(button).color).toBe("rgb(224, 224, 224)");
      await page.screenshot({ path: `.local/sun-earth-info-${type}.png` });

      dateSource = "layer";
      dateSourceLabel = "Time-based layer: Illumination (fallback)";
      dateWarning = "Using time-based layer initial date, not a dated EVA.";
      renderMap(type);
      expect(getComputedStyle(button).color).toBe("rgb(255, 239, 97)");
      await page.screenshot({ path: `.local/sun-earth-info-warning-${type}.png` });
      const tooltip = await openSourceTooltip();
      expect(tooltip.textContent).toBe(
        "Date (UTC): 2028-08-04T22:00:00.000ZDate Source: Time-based layer: Illumination (initial date)"
      );
    }
  );

  it.each(["editor", "dashboard"] as const)(
    "moves both rendered icons clockwise with their angles on the %s map",
    (type) => {
      const iconCenter = (body: "sun" | "earth-americas") => {
        const rect = harness.container
          .querySelector(`svg[data-icon="${body}"]`)
          .getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      };
      const radius = type === "editor" ? 24 : 30;
      preset = { ...preset, sunAzimuth: 0, earthAzimuth: 0 };
      renderMap(type);
      const startSun = iconCenter("sun");
      const startEarth = iconCenter("earth-americas");

      for (const angle of [0.25, 2, 90, 180, 270, 360]) {
        preset = { ...preset, sunAzimuth: angle, earthAzimuth: angle };
        renderMap(type);
        const radians = (angle * Math.PI) / 180;
        for (const [position, start] of [
          [iconCenter("sun"), startSun],
          [iconCenter("earth-americas"), startEarth],
        ]) {
          expect(position.x - start.x).toBeCloseTo(radius * Math.sin(radians), 1);
          expect(position.y - start.y).toBeCloseTo(radius * (1 - Math.cos(radians)), 1);
        }
      }
    }
  );

  it.each(["editor", "dashboard"] as const)(
    "moves the rendered sun and earth icons when the calculation date changes on the %s map",
    (type) => {
      preset = { ...preset, sunEarthFromDate: true };
      renderMap(type);
      const icons = ["sun", "earth-americas"].map((body) =>
        harness.container.querySelector(`svg[data-icon="${body}"]`)
      );
      const before = icons.map((icon) => icon.getBoundingClientRect());
      const initialText = harness.container.textContent;
      mapDatetime = "2028-08-04T22:15:00Z";
      renderMap(type);
      const smallMove = icons[0].getBoundingClientRect();
      expect(Math.hypot(smallMove.x - before[0].x, smallMove.y - before[0].y)).toBeGreaterThan(
        0.01
      );
      expect(harness.container.textContent).toBe(initialText);
      dateSource = "timeline-hover";
      dateSourceLabel = "Timeline hover: EVA 1 (+349200 s)";
      mapDatetime = "2028-08-08T23:00:00Z";
      renderMap(type);
      icons.forEach((icon, index) => {
        const after = icon.getBoundingClientRect();
        expect(Math.hypot(after.x - before[index].x, after.y - before[index].y)).toBeGreaterThan(
          0.1
        );
      });
      mapDatetime = "2028-08-04T22:00:00Z";
      renderMap(type);
      icons.forEach((icon, index) => {
        const restored = icon.getBoundingClientRect();
        expect(restored.x).toBeCloseTo(before[index].x, 2);
        expect(restored.y).toBeCloseTo(before[index].y, 2);
      });
    }
  );

  it.each(["editor", "dashboard"] as const)(
    "warns about manual values and explains their source on the %s map",
    async (type) => {
      renderMap(type);
      expect(harness.container.querySelector("button")?.dataset.status).toBe("Manual");
      expect(harness.container.querySelector("button")?.dataset.warning).toBe("true");
      const tooltip = await openSourceTooltip();
      expect(tooltip.textContent).toBe(
        "Date (UTC): unavailableDate Source: manual preset azimuths"
      );
    }
  );

  it("shows the date and named EVA for calculated values, including on keyboard focus", async () => {
    preset = { ...preset, name: "Lunar preset", sunEarthFromDate: true };
    renderMap();
    expect(harness.container.querySelector("button")?.dataset.status).toBe("Calculated");
    expect(harness.container.querySelector("button")?.dataset.warning).toBe("false");
    const button = harness.container.querySelector<HTMLButtonElement>("button");
    button.focus();
    await vi.waitFor(() => {
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.classList.contains("react-tooltip__show")).toBe(true);
      expect(tooltip?.textContent).toContain("Selected EVA: EVA 1");
      expect(tooltip?.textContent).toContain("2028-08-04T22:00:00.000Z");
      expect(tooltip?.textContent).toBe(
        "Date (UTC): 2028-08-04T22:00:00.000ZDate Source: Selected EVA: EVA 1"
      );
    });
  });

  it.each(["layer", "preset-preview"] as const)(
    "warns about an undated EVA even with a %s date",
    async (source) => {
      preset = { ...preset, sunEarthFromDate: true };
      dateSource = source;
      dateSourceLabel =
        source === "layer" ? "Time-based layer: Illumination (fallback)" : "Preset preview";
      evaWarning = "Selected EVA EVA 1 has no valid date.";
      dateWarning =
        evaWarning +
        (source === "layer" ? " Using time-based layer initial date, not a dated EVA." : "");
      renderMap();
      expect(harness.container.querySelector("button")?.dataset.status).toBe(
        source === "layer" ? "Fallback" : "Preview"
      );
      expect(harness.container.querySelector("button")?.dataset.warning).toBe("true");
      const tooltip = await openSourceTooltip();
      expect(tooltip.textContent).toContain(dateSourceLabel.replace(/ \(fallback\)$/, ""));
      expect(tooltip.textContent).not.toContain("Warning:");
      expect(tooltip.textContent).not.toContain("fallback");
      if (source === "layer")
        await page.screenshot({ path: ".local/sun-earth-warning-tooltip.png" });
      dateSource = "eva";
      dateSourceLabel = "Selected EVA: EVA 1";
      dateWarning = null;
      evaWarning = null;
      renderMap();
      expect(harness.container.querySelector("button")?.dataset.warning).toBe("false");
      expect(harness.container.querySelector("button")?.dataset.status).toBe("Calculated");
    }
  );

  it("warns when no date exists and retains the manual directions", async () => {
    preset = { ...preset, sunEarthFromDate: true };
    mapDatetime = null;
    dateWarning = "No map date is available.";
    renderMap();
    const tooltip = await openSourceTooltip();
    expect(tooltip.textContent).toBe("Date (UTC): unavailableDate Source: manual preset azimuths");
    expect(harness.container.textContent).toContain("123°");
    expect(harness.container.textContent).toContain("234°");
  });

  it("warns and uses manual values when the map projection cannot be resolved", async () => {
    preset = { ...preset, sunEarthFromDate: true };
    mission.projProj4String = null;
    renderMap();
    const tooltip = await openSourceTooltip();
    expect(tooltip.textContent).toBe("Date (UTC): unavailableDate Source: manual preset azimuths");
    expect(harness.container.querySelector("button")?.dataset.status).toBe("Manual");
    expect(harness.container.textContent).toContain("123°");
  });

  it("does not show source controls when both indicators are disabled", () => {
    preset = { ...preset, sunEnabled: false, earthEnabled: false };
    renderMap();
    expect(harness.container.firstChild).toBeNull();
  });

  it.each([
    "Preset preview",
    "Selected EVA: EVA 1",
    "Time-based layer: Lunar illumination (fallback)",
  ])("shows %s beneath the calculation date", async (sourceLabel) => {
    dateSourceLabel = sourceLabel;
    upsertTestPreset({ ...preset, sunEarthFromDate: true });
    render(false);
    const source = harness.container.querySelector<HTMLElement>(
      '[aria-label="sunEarthDateSource"]'
    );
    expect(source.textContent).toBe(`Source: ${sourceLabel}`);
    expect(source.previousElementSibling.textContent).toContain("2028-08-04T22:00:00.000Z");
    expect(source.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      source.previousElementSibling.getBoundingClientRect().bottom
    );
    if (sourceLabel.startsWith("Time-based layer")) {
      await page.screenshot({ path: ".local/preset-azimuth-date-source.png" });
    }
  });

  it("switches to projected date directions and restores manual values", async () => {
    render();
    const toggle = harness.container.querySelector<HTMLInputElement>("#sunEarthFromDateCheckbox");
    toggle.click();
    await vi.waitFor(() => {
      expect(harness.container.textContent).toContain("8°");
      expect(harness.container.textContent).toContain("3°");
      expect(harness.container.querySelector('[aria-label="SunDegrees"]')).toBeNull();
    });
    expect(mission.presets[preset.uuid]).toMatchObject({
      sunEarthFromDate: true,
      sunAzimuth: 123,
      earthAzimuth: 234,
    });
    toggle.click();
    await vi.waitFor(() => {
      expect(harness.container.querySelector('[aria-label="SunDegrees"]')).not.toBeNull();
    });
    expect(mission.presets[preset.uuid]).toMatchObject({
      sunAzimuth: 123,
      earthAzimuth: 234,
    });
  });

  it.each([null, "invalid date"])("falls back to manual directions for %s", (date) => {
    mapDatetime = date;
    upsertTestPreset({ ...preset, sunEarthFromDate: true });
    render();
    expect(harness.container.textContent).toContain("using manual azimuths");
    expect(harness.container.querySelector('[aria-label="sunEarthDateSource"]')).toBeNull();
    expect(harness.container.textContent).toContain("123°");
    expect(harness.container.textContent).toContain("234°");
  });

  it("uses manual directions when the lander location is unavailable", () => {
    mission.landerLocation = null;
    upsertTestPreset({ ...preset, sunEarthFromDate: true });
    render();
    expect(harness.container.textContent).toContain("using manual azimuths");
    expect(harness.container.textContent).toContain("123°");
  });

  it("updates date directions and uses the same values on the map", async () => {
    preset = { ...preset, sunEarthFromDate: true };
    upsertTestPreset(preset);
    render(false);
    expect(harness.container.textContent).toContain("8°");
    mapDatetime = "2028-08-08T23:00:00Z";
    render(false);
    await vi.waitFor(() => {
      expect(harness.container.textContent).toContain("319°");
      expect(harness.container.textContent).toContain("358°");
    });
    harness.render(
      <Provider store={store}>
        <SunEarth type="editor" selectedPreset={preset} />
      </Provider>
    );
    expect(harness.container.textContent).toContain("319°");
    expect(harness.container.textContent).toContain("358°");
  });

  it("renders edit and read-only controls without overflowing a narrow panel", async () => {
    render();
    expect(harness.container.scrollWidth).toBeLessThanOrEqual(360);
    await page.screenshot({ path: ".local/preset-azimuth-edit.png" });
    render(false);
    expect(harness.container.querySelector("input")).toBeNull();
    expect(harness.container.scrollWidth).toBeLessThanOrEqual(360);
    await page.screenshot({ path: ".local/preset-azimuth-view.png" });
  });
});
