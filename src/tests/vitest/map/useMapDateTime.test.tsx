/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Unit tests for `useMapDateTime`, the shared map time hook.
 *
 * Renders the hook through a tiny <Probe> component inside a real Redux
 * store with the relevant slices preloaded. Exercises each branch of the
 * datetime priority chain documented in useMapDateTime.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import {
  useMapDateTime,
  useMapDateTimeWithSource,
} from "components/interface/map/hooks/useMapDateTime";
import { presetSlice, initialState as presetInit } from "store/preset";
import { interfaceSlice, initialState as interfaceInit } from "store/interface";
import { missionSlice, initialState as missionInit } from "store/mission";
import { evaSlice, initialState as evaInit } from "store/eva";
import {
  hoverSlice,
  initialState as hoverInit,
  setSequenceHover,
  clearMapItemHover,
} from "store/hover";
import { useSunEarthAzimuths } from "components/interface/map/hooks/useSunEarthAzimuths";
import { getLayersToShow } from "components/interface/map/utils/getLayersToShow";
import { generateBlankPreset } from "store/storeUtils/preset";
import { generateBlankSublayer, defaultSublayerStyle } from "store/storeUtils/sublayer";

// Mutable doc state: tests set fields directly before rendering.
// The selector mock calls the selector with this object as the doc.
const docState: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(docState as Mission),
  useDocSelector: (): undefined => undefined,
}));

type RootState = {
  preset: typeof presetInit;
  interface: typeof interfaceInit;
  mission: typeof missionInit;
  eva: typeof evaInit;
  hover: typeof hoverInit;
};

function makeStore(partial: Partial<RootState> = {}) {
  return configureStore({
    reducer: {
      preset: presetSlice.reducer,
      interface: interfaceSlice.reducer,
      mission: missionSlice.reducer,
      eva: evaSlice.reducer,
      hover: hoverSlice.reducer,
    },
    preloadedState: {
      preset: { ...presetInit, ...partial.preset },
      interface: { ...interfaceInit, ...partial.interface },
      mission: { ...missionInit, ...partial.mission },
      eva: { ...evaInit, ...partial.eva },
      hover: { ...hoverInit, ...partial.hover },
    },
  });
}

let captured: string | null | undefined;
let capturedWithSource: MapDateTimeWithSource | null;
let capturedAzimuths: SunEarthAzimuths;
const datePreset = generateBlankPreset({ sunEarthFromDate: true });

function Probe(): null {
  captured = useMapDateTime();
  capturedWithSource = useMapDateTimeWithSource();
  capturedAzimuths = useSunEarthAzimuths(datePreset);
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  captured = undefined;
  // Reset mutable doc state before each test
  for (const key of Object.keys(docState)) {
    delete (docState as Record<string, unknown>)[key];
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
});

function render(store: ReturnType<typeof makeStore>) {
  flushSync(() =>
    root.render(
      <Provider store={store}>
        <Probe />
      </Provider>
    )
  );
}

describe("useMapDateTime", () => {
  it("recalculates sun/earth directions at EVA start plus hover time and restores them on leave", () => {
    const datetime = Date.parse("2026-04-15T23:30:00Z");
    docState.evas = { "eva-1": { uuid: "eva-1", datetime } as Eva };
    docState.landerLocation = { lat: -89, lng: 45 };
    const store = makeStore({ eva: { ...evaInit, selectedEvaUuid: "eva-1" } });
    render(store);
    const startAzimuths = capturedAzimuths;
    const hover = (elapsedSeconds: number) =>
      flushSync(() =>
        store.dispatch(
          setSequenceHover({
            sequenceUuid: null,
            sequenceItemPercentElapsed: null,
            mapItemType: null,
            timelineTime: { evaUuid: "eva-1", elapsedSeconds },
          })
        )
      );

    hover(0);
    expect(capturedAzimuths.datetime).toBe(datetime);
    expect(capturedWithSource.source).toBe("timeline-hover");
    hover(6 * 3600);
    expect(captured).toBe("2026-04-16T05:30:00.000Z");
    expect(capturedAzimuths.datetime).toBe(datetime + 6 * 3600 * 1000);
    expect(capturedAzimuths.source).toBe("date");
    expect(capturedAzimuths.sunAzimuth).not.toBe(startAzimuths.sunAzimuth);
    expect(capturedAzimuths.datetimeSourceLabel).toContain("+21600 s");
    expect(docState.evas["eva-1"].datetime).toBe(datetime);

    flushSync(() => store.dispatch(clearMapItemHover()));
    expect(capturedAzimuths).toEqual(startAzimuths);
  });

  it.each([NaN, Infinity, -1, 1e20])("ignores invalid hover offset %s", (elapsedSeconds) => {
    docState.evas = { "eva-1": { uuid: "eva-1", datetime: 0 } as Eva };
    render(
      makeStore({
        eva: { ...evaInit, selectedEvaUuid: "eva-1" },
        hover: { ...hoverInit, timelineTime: { evaUuid: "eva-1", elapsedSeconds } },
      })
    );
    expect(captured).toBe("1970-01-01T00:00:00.000Z");
    expect(capturedWithSource.source).toBe("eva");
  });

  it("ignores hover time from a different EVA", () => {
    docState.evas = { "eva-2": { uuid: "eva-2", datetime: 0 } as Eva };
    render(
      makeStore({
        eva: { ...evaInit, selectedEvaUuid: "eva-2" },
        hover: { ...hoverInit, timelineTime: { evaUuid: "eva-1", elapsedSeconds: 3600 } },
      })
    );
    expect(captured).toBe("1970-01-01T00:00:00.000Z");
    expect(capturedWithSource.source).toBe("eva");
  });

  it("returns null when no time sources are present", () => {
    render(makeStore());
    expect(captured).toBeNull();
    expect(capturedWithSource).toMatchObject({
      datetime: null,
      source: null,
      warning: "No map date is available.",
    });
  });

  it("returns presetPreviewTime when section is 'preset' and a preview time is set", () => {
    const store = makeStore({
      preset: { ...presetInit, presetPreviewTime: "2026-05-01T12:00:00Z" },
      interface: { ...interfaceInit, sectionSelectedLabel: "preset" },
    });
    render(store);
    expect(captured).toBe("2026-05-01T12:00:00Z");
    expect(capturedWithSource).toMatchObject({
      datetime: captured,
      sourceLabel: "Preset preview",
      source: "preset-preview",
      warning: null,
    });
  });

  it("ignores presetPreviewTime when section is NOT 'preset'", () => {
    const store = makeStore({
      preset: { ...presetInit, presetPreviewTime: "2026-05-01T12:00:00Z" },
      interface: { ...interfaceInit, sectionSelectedLabel: "evas" },
    });
    render(store);
    expect(captured).toBeNull();
  });

  it("returns selected EVA timestamp as an ISO datetime", () => {
    const evaUuid = "eva-1";
    docState.evas = {
      [evaUuid]: {
        uuid: evaUuid,
        name: "EVA 1",
        datetime: Date.parse("2026-04-15T08:30:00Z"),
      } as Eva,
    };
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBe("2026-04-15T08:30:00.000Z");
    expect(capturedWithSource).toMatchObject({
      datetime: captured,
      sourceLabel: "Selected EVA: EVA 1",
      source: "eva",
      warning: null,
    });
  });

  it.each([NaN, Infinity, 8.64e15 + 1, null])("ignores EVA timestamp %s", (datetime) => {
    const evaUuid = "eva-1";
    docState.evas = { [evaUuid]: { uuid: evaUuid, datetime } as Eva };
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBeNull();
    expect(capturedWithSource.warning).toContain("Selected EVA eva-1 has no valid date");
  });

  it("uses an EVA timestamp of zero", () => {
    docState.evas = { "eva-1": { uuid: "eva-1", datetime: 0 } as Eva };
    render(makeStore({ eva: { ...evaInit, selectedEvaUuid: "eva-1" } }));
    expect(captured).toBe("1970-01-01T00:00:00.000Z");
  });

  it("selects the same time layer for an EVA as for preset preview", () => {
    const previewTime = "2026-03-02T00:00:00Z";
    const sublayer = generateBlankSublayer({
      uuid: "time-layer",
      path: "/time-layer",
      isTimeBased: true,
      timeLayerManifest: [
        {
          datetime: "2026-03-01T00:00:00Z",
          dirName: "first",
          lowerBound: "2026-03-01T00:00:00Z",
          upperBound: "2026-03-01T12:00:00Z",
        },
        {
          datetime: previewTime,
          dirName: "second",
          lowerBound: "2026-03-01T12:00:00Z",
          upperBound: previewTime,
        },
      ],
    });
    const preset = generateBlankPreset({
      layerOrder: [{ layerUuid: sublayer.layerUuid, sublayerUuids: [sublayer.uuid] }],
      mapSublayerControls: {
        [sublayer.uuid]: {
          sublayerUuid: sublayer.uuid,
          name: sublayer.name,
          visible: true,
          style: { ...defaultSublayerStyle },
        },
      },
    });
    docState.evas = {
      "eva-1": { uuid: "eva-1", datetime: Date.parse(previewTime) } as Eva,
    };
    docState.sublayers = { [sublayer.uuid]: sublayer };
    const store = makeStore({
      preset: { ...presetInit, presetPreviewTime: previewTime },
      interface: { ...interfaceInit, sectionSelectedLabel: "preset" },
      eva: { ...evaInit, selectedEvaUuid: "eva-1" },
    });
    const resolveLayers = () =>
      getLayersToShow({
        selectedPreset: preset,
        missionSublayers: [sublayer],
        missionLayers: [],
        mapDateTime: captured ?? null,
      });

    render(store);
    const previewLayers = resolveLayers();
    expect(capturedWithSource.sourceLabel).toBe("Preset preview");
    expect(previewLayers[0].path).toBe("/time-layer/second");

    flushSync(() => store.dispatch(interfaceSlice.actions.setSectionSelected("evas")));
    expect(resolveLayers()).toEqual(previewLayers);
    expect(capturedWithSource.sourceLabel).toBe("Selected EVA: eva-1");
  });

  it("falls back to first time-based sublayer manifest entry", () => {
    docState.sublayers = {
      "sub-1": {
        uuid: "sub-1",
        name: "non-time",
        isTimeBased: false,
        timeLayerManifest: null,
      } as unknown as Sublayer,
      "sub-2": {
        uuid: "sub-2",
        name: "time-based",
        isTimeBased: true,
        timeLayerManifest: [
          { datetime: "2026-03-01T00:00:00Z" },
          { datetime: "2026-03-02T00:00:00Z" },
        ],
      } as unknown as Sublayer,
    };
    const store = makeStore({});
    render(store);
    expect(captured).toBe("2026-03-01T00:00:00Z");
    expect(capturedWithSource).toMatchObject({
      datetime: captured,
      sourceLabel: "Time-based layer: time-based (fallback)",
      source: "layer",
      warning: "Using time-based layer initial date, not a dated EVA.",
    });
  });

  it.each([null, NaN])(
    "warns about an EVA date of %s even when a layer supplies a fallback",
    (datetime) => {
      docState.evas = { "eva-1": { uuid: "eva-1", name: "EVA 1", datetime } as Eva };
      const sublayer = generateBlankSublayer({
        name: "Illumination",
        isTimeBased: true,
        timeLayerManifest: [
          {
            datetime: "2026-03-01T00:00:00Z",
            dirName: "first",
            lowerBound: "2026-03-01T00:00:00Z",
            upperBound: "2026-03-02T00:00:00Z",
          },
        ],
      });
      docState.sublayers = { [sublayer.uuid]: sublayer };
      const store = makeStore({ eva: { ...evaInit, selectedEvaUuid: "eva-1" } });
      render(store);
      expect(capturedWithSource.source).toBe("layer");
      expect(capturedWithSource.warning).toContain("Selected EVA EVA 1 has no valid date");
      expect(capturedWithSource.warning).toContain("time-based layer initial date");
      docState.evas["eva-1"].datetime = Date.parse("2026-04-15T08:30:00Z");
      render(store);
      expect(capturedWithSource.source).toBe("eva");
      expect(capturedWithSource.warning).toBeNull();
    }
  );

  it("warns about an undated EVA while using a preset preview", () => {
    docState.evas = { "eva-1": { uuid: "eva-1", name: "EVA 1", datetime: null } as Eva };
    render(
      makeStore({
        eva: { ...evaInit, selectedEvaUuid: "eva-1" },
        preset: { ...presetInit, presetPreviewTime: "2026-05-01T12:00:00Z" },
        interface: { ...interfaceInit, sectionSelectedLabel: "preset" },
      })
    );
    expect(capturedWithSource.source).toBe("preset-preview");
    expect(capturedWithSource.warning).toBe("Selected EVA EVA 1 has no valid date.");
  });

  it("preset preview time takes priority over EVA datetime", () => {
    const evaUuid = "eva-1";
    docState.evas = {
      [evaUuid]: { uuid: evaUuid, datetime: Date.parse("2026-04-15T08:30:00Z") } as Eva,
    };
    const store = makeStore({
      preset: { ...presetInit, presetPreviewTime: "2026-05-01T12:00:00Z" },
      interface: { ...interfaceInit, sectionSelectedLabel: "preset" },
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBe("2026-05-01T12:00:00Z");
  });

  it("EVA datetime takes priority over time-based sublayer manifest", () => {
    const evaUuid = "eva-1";
    docState.evas = {
      [evaUuid]: { uuid: evaUuid, datetime: Date.parse("2026-04-15T08:30:00Z") } as Eva,
    };
    docState.sublayers = {
      "sub-2": {
        uuid: "sub-2",
        name: "time-based",
        isTimeBased: true,
        timeLayerManifest: [{ datetime: "2026-03-01T00:00:00Z" }],
      } as unknown as Sublayer,
    };
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBe("2026-04-15T08:30:00.000Z");
  });
});
