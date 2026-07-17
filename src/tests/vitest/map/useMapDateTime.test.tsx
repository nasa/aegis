/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Unit tests for `useMapDateTime` — pure derivation hook.
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

// Mutable doc state — tests set fields directly before rendering.
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

  it("returns selected EVA datetime when set and is a valid ISO string", () => {
    const evaUuid = "eva-1";
    docState.evas = {
      [evaUuid]: { uuid: evaUuid, datetime: "2026-04-15T08:30:00Z" } as unknown as Eva,
    };
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBe("2026-04-15T08:30:00Z");
  });

  it("ignores EVA datetime when not a valid ISO string", () => {
    const evaUuid = "eva-1";
    docState.evas = { [evaUuid]: { uuid: evaUuid, datetime: "not-a-date" } as unknown as Eva };
    const store = makeStore({
      eva: { ...evaInit, selectedEvaUuid: evaUuid },
    });
    render(store);
    expect(captured).toBeNull();
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
      [evaUuid]: { uuid: evaUuid, datetime: "2026-04-15T08:30:00Z" } as unknown as Eva,
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
      [evaUuid]: { uuid: evaUuid, datetime: "2026-04-15T08:30:00Z" } as unknown as Eva,
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
    expect(captured).toBe("2026-04-15T08:30:00Z");
  });
});
