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
import { useMapDateTime } from "components/interface/map/hooks/useMapDateTime";
import { presetSlice, initialState as presetInit } from "store/preset";
import { interfaceSlice, initialState as interfaceInit } from "store/interface";
import { missionSlice, initialState as missionInit } from "store/mission";
import { evaSlice, initialState as evaInit } from "store/eva";
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
};

function makeStore(partial: Partial<RootState> = {}) {
  return configureStore({
    reducer: {
      preset: presetSlice.reducer,
      interface: interfaceSlice.reducer,
      mission: missionSlice.reducer,
      eva: evaSlice.reducer,
    },
    preloadedState: {
      preset: { ...presetInit, ...partial.preset },
      interface: { ...interfaceInit, ...partial.interface },
      mission: { ...missionInit, ...partial.mission },
      eva: { ...evaInit, ...partial.eva },
    },
  });
}

let captured: string | null | undefined;

function Probe(): null {
  captured = useMapDateTime();
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
  it("returns null when no time sources are present", () => {
    render(makeStore());
    expect(captured).toBeNull();
  });

  it("returns presetPreviewTime when section is 'preset' and a preview time is set", () => {
    const store = makeStore({
      preset: { ...presetInit, presetPreviewTime: "2026-05-01T12:00:00Z" },
      interface: { ...interfaceInit, sectionSelectedLabel: "preset" },
    });
    render(store);
    expect(captured).toBe("2026-05-01T12:00:00Z");
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
      [evaUuid]: { uuid: evaUuid, datetime: Date.parse("2026-04-15T08:30:00Z") } as Eva,
    };
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBe("2026-04-15T08:30:00.000Z");
  });

  it.each([NaN, Infinity, 8.64e15 + 1, null])("ignores EVA timestamp %s", (datetime) => {
    const evaUuid = "eva-1";
    docState.evas = { [evaUuid]: { uuid: evaUuid, datetime } as Eva };
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBeNull();
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
    const store = makeStore({
      preset: { ...presetInit, presetPreviewTime: previewTime },
      interface: { ...interfaceInit, sectionSelectedLabel: "preset" },
      mission: { ...missionInit, sublayers: [sublayer] },
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
    expect(previewLayers[0].path).toBe("/time-layer/second");

    flushSync(() => store.dispatch(interfaceSlice.actions.setSectionSelected("evas")));
    expect(resolveLayers()).toEqual(previewLayers);
  });

  it("falls back to first time-based sublayer manifest entry", () => {
    const store = makeStore({
      mission: {
        ...missionInit,
        sublayers: [
          {
            uuid: "sub-1",
            name: "non-time",
            isTimeBased: false,
            timeLayerManifest: null,
          } as unknown as Sublayer,
          {
            uuid: "sub-2",
            name: "time-based",
            isTimeBased: true,
            timeLayerManifest: [
              { datetime: "2026-03-01T00:00:00Z" },
              { datetime: "2026-03-02T00:00:00Z" },
            ],
          } as unknown as Sublayer,
        ],
      },
    });
    render(store);
    expect(captured).toBe("2026-03-01T00:00:00Z");
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
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
      mission: {
        ...missionInit,
        sublayers: [
          {
            uuid: "sub-2",
            name: "time-based",
            isTimeBased: true,
            timeLayerManifest: [{ datetime: "2026-03-01T00:00:00Z" }],
          } as unknown as Sublayer,
        ],
      },
    });
    render(store);
    expect(captured).toBe("2026-04-15T08:30:00.000Z");
  });
});
