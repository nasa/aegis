/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `FeatureSourcesProvider`.
 *
 * Verifies the provider creates one VectorSource per feature category, the
 * `useFeatureSources()` hook returns them, the same instances persist
 * across re-renders (memoised), and the hook throws outside the provider.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import VectorSource from "ol/source/Vector";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
  type FeatureSourcesContextValue,
} from "components/interface/map/FeatureSourcesProvider";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

let harness: ReactHarness;
let captured: FeatureSourcesContextValue | null;

function Probe(): null {
  captured = useFeatureSourcesContext();
  return null;
}

beforeEach(() => {
  harness = createReactHarness();
  captured = null;
});

afterEach(() => {
  harness.unmount();
});

describe("FeatureSourcesProvider", () => {
  it("provides the named VectorSources behaviors depend on", () => {
    harness.render(
      <FeatureSourcesProvider>
        <Probe />
      </FeatureSourcesProvider>
    );

    expect(captured).not.toBeNull();
    // Required keys — adding *more* sources should not break this test.
    const requiredKeys: (keyof FeatureSourcesContextValue)[] = [
      "stationSource",
      "traverseSource",
      "posSource",
      "posPathSource",
      "circleSource",
      "poiSource",
      "actionSource",
      "walkbackSource",
      "measurementSource",
      "highlightSource",
      "labelSource",
    ];
    for (const key of requiredKeys) {
      expect(captured![key], `${key} should be a VectorSource`).toBeInstanceOf(VectorSource);
    }
  });

  it("returns the SAME source instances across re-renders (memoised)", () => {
    harness.render(
      <FeatureSourcesProvider>
        <Probe />
      </FeatureSourcesProvider>
    );
    const first = captured!;

    harness.render(
      <FeatureSourcesProvider>
        <Probe />
      </FeatureSourcesProvider>
    );
    const second = captured!;

    expect(second.stationSource).toBe(first.stationSource);
    expect(second.poiSource).toBe(first.poiSource);
    expect(second.labelSource).toBe(first.labelSource);
  });

  it("useFeatureSources throws when called outside the provider", () => {
    let thrown: Error | null = null;
    function ThrowProbe(): null {
      try {
        useFeatureSourcesContext();
      } catch (e) {
        thrown = e as Error;
      }
      return null;
    }
    harness.render(<ThrowProbe />);
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/FeatureSourcesProvider/);
  });
});
