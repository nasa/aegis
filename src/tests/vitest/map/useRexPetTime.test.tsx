/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Unit tests for `useRexPetTime` — ticking PET-time hook for the running REX.
 *
 * Renders the hook through a tiny <Probe> with a Redux store that exposes the
 * rex slice. Uses fake timers to control the 100 ms tick, and stubs Date.now
 * to keep the calculatePetValue() output deterministic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { useRexPetTime } from "components/interface/map/hooks/useRexPetTime";
import { rexSlice, initialState as rexInit } from "store/rex";

// Mutable doc state — tests set rexes directly.
const docState: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(docState as Mission),
  useDocSelector: (): undefined => undefined,
}));

const FAKE_NOW = Date.parse("2026-05-01T12:00:00Z");

function makeStore() {
  return configureStore({
    reducer: { rex: rexSlice.reducer },
    preloadedState: {
      rex: { ...rexInit },
    },
  });
}

function setDocRexes(rexes: Partial<Rex>[]) {
  const byUuid: Record<string, Rex> = {};
  for (const rex of rexes) {
    if (rex.uuid) byUuid[rex.uuid] = rex as Rex;
  }
  docState.rexes = byUuid;
}

let captured: string;

function Probe(): null {
  captured = useRexPetTime();
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Reset mutable doc state
  for (const key of Object.keys(docState)) {
    delete (docState as Record<string, unknown>)[key];
  }
  captured = "<unset>";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FAKE_NOW));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const store = makeStore();

function render() {
  flushSync(() =>
    root.render(
      <Provider store={store}>
        <Probe />
      </Provider>
    )
  );
  // useEffect runs in a microtask after commit. Drain microtasks + flush any
  // pending state updates the effect scheduled (e.g. setPetTime for paused PET).
  flushSync(() => {});
}

describe("useRexPetTime", () => {
  it("returns empty string when no REX is running", () => {
    setDocRexes([]);
    render();
    expect(captured).toBe("");
  });

  it("returns empty string when REXes exist but none are running", () => {
    setDocRexes([
      {
        uuid: "r1",
        isRunning: false,
        petRunning: true,
        petStartStopTimestamp: "2026-05-01T11:00:00Z",
        petValueAtStartStop: "+00:00:00",
      } as Rex,
    ]);
    render();
    expect(captured).toBe("");
  });

  it("shows the static petValueAtStartStop when PET is paused", async () => {
    setDocRexes([
      {
        uuid: "r1",
        isRunning: true,
        petRunning: false,
        petStartStopTimestamp: "2026-05-01T11:00:00Z",
        petValueAtStartStop: "+00:42:15",
      } as Rex,
    ]);
    render();
    // Effect that calls setPetTime runs in a microtask after commit.
    await vi.runAllTimersAsync();
    flushSync(() => {});
    expect(captured).toBe("+00:42:15");
  });

  it("ticks the PET value while PET is running (one hour elapsed)", () => {
    // PET clock started exactly 1h before the timer will fire (FAKE_NOW + 100ms)
    const tickFireMs = FAKE_NOW + 100;
    setDocRexes([
      {
        uuid: "r1",
        isRunning: true,
        petRunning: true,
        petStartStopTimestamp: new Date(tickFireMs - 60 * 60 * 1000).toISOString(),
        petValueAtStartStop: "+00:00:00",
      } as Rex,
    ]);
    render();

    // Initial mount: useState defaults to "" until the first 100ms tick.
    expect(captured).toBe("");

    flushSync(() => {
      vi.advanceTimersByTime(100);
    });

    expect(captured).toBe("+01:00:00");
  });

  it("PET value advances on subsequent ticks as time progresses", () => {
    setDocRexes([
      {
        uuid: "r1",
        isRunning: true,
        petRunning: true,
        petStartStopTimestamp: new Date(FAKE_NOW).toISOString(),
        petValueAtStartStop: "+00:00:00",
      } as Rex,
    ]);
    render();

    // Tick #1: advance 5_000 ms — Date.now becomes FAKE_NOW + 5_000 when timer fires
    flushSync(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(captured).toBe("+00:00:05");

    // Tick #2: advance another 60_000 ms — total elapsed is 65 s
    flushSync(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(captured).toBe("+00:01:05");
  });

  it("clears interval on unmount (no leak)", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    setDocRexes([
      {
        uuid: "r1",
        isRunning: true,
        petRunning: true,
        petStartStopTimestamp: new Date(FAKE_NOW).toISOString(),
        petValueAtStartStop: "+00:00:00",
      } as Rex,
    ]);
    render();

    // Reset the spy so we only count calls made by the unmount cleanup.
    clearSpy.mockClear();

    flushSync(() => root.unmount());
    // Re-create root so afterEach unmount remains safe
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    // Cleanup must have called clearInterval at least once with a real handle.
    expect(clearSpy).toHaveBeenCalled();
    const handles = clearSpy.mock.calls.map(([h]) => h);
    expect(handles.some((h) => h !== null && h !== undefined)).toBe(true);
    clearSpy.mockRestore();
  });
});
