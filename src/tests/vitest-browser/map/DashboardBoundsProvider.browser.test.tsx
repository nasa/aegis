/**
 * Browser-mode tests for `DashboardBoundsProvider`.
 *
 * Verifies the initial null extent, the setter mutates context state for
 * subsequent reads, the setter identity is stable across re-renders, and
 * the hook throws when used outside the provider.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DashboardBoundsProvider,
  useDashboardBoundsContext,
  type DashboardBoundsContextValue,
} from "components/interface/map/DashboardBoundsProvider";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

let harness: ReactHarness;

beforeEach(() => {
  harness = createReactHarness();
});

afterEach(() => {
  harness.unmount();
});

describe("DashboardBoundsProvider", () => {
  it("starts with bigMapExtent = null", () => {
    let captured: DashboardBoundsContextValue | null = null;
    function Probe(): null {
      captured = useDashboardBoundsContext();
      return null;
    }
    harness.render(
      <DashboardBoundsProvider>
        <Probe />
      </DashboardBoundsProvider>
    );
    expect(captured).not.toBeNull();
    expect(captured!.bigMapExtent).toBeNull();
  });

  it("publishes a new extent and consumers see it", async () => {
    const seen: (readonly number[] | null)[] = [];
    let setter: ((e: number[]) => void) | null = null;

    function Probe(): null {
      const ctx = useDashboardBoundsContext();
      seen.push(ctx.bigMapExtent ? [...ctx.bigMapExtent] : null);
      setter = ctx.setBigMapExtent;
      return null;
    }

    harness.render(
      <DashboardBoundsProvider>
        <Probe />
      </DashboardBoundsProvider>
    );
    expect(seen[seen.length - 1]).toBeNull();

    const { flushSync } = await import("react-dom");
    flushSync(() => setter!([10, 20, 30, 40]));

    expect(seen[seen.length - 1]).toEqual([10, 20, 30, 40]);
  });

  it("setBigMapExtent identity is stable across re-renders (useCallback)", () => {
    const setters: (((e: number[]) => void) | undefined)[] = [];
    function Probe(): null {
      setters.push(useDashboardBoundsContext().setBigMapExtent);
      return null;
    }

    harness.render(
      <DashboardBoundsProvider>
        <Probe />
      </DashboardBoundsProvider>
    );
    harness.render(
      <DashboardBoundsProvider>
        <Probe />
      </DashboardBoundsProvider>
    );

    expect(setters.length).toBeGreaterThanOrEqual(2);
    expect(setters[1]).toBe(setters[0]);
  });

  it("defaults showScaleBar and showArrows to true", () => {
    let captured: DashboardBoundsContextValue | null = null;
    function Probe(): null {
      captured = useDashboardBoundsContext();
      return null;
    }
    harness.render(
      <DashboardBoundsProvider>
        <Probe />
      </DashboardBoundsProvider>
    );
    expect(captured!.showScaleBar).toBe(true);
    expect(captured!.showArrows).toBe(true);
  });

  it("setters update showScaleBar and showArrows for consumers", async () => {
    let ctx: DashboardBoundsContextValue | null = null;
    function Probe(): null {
      ctx = useDashboardBoundsContext();
      return null;
    }

    harness.render(
      <DashboardBoundsProvider>
        <Probe />
      </DashboardBoundsProvider>
    );

    const { flushSync } = await import("react-dom");
    flushSync(() => ctx!.setShowScaleBar(false));
    expect(ctx!.showScaleBar).toBe(false);

    flushSync(() => ctx!.setShowArrows(false));
    expect(ctx!.showArrows).toBe(false);
  });

  it("useDashboardBounds throws when called outside the provider", () => {
    let thrown: Error | null = null;
    function ThrowProbe(): null {
      try {
        useDashboardBoundsContext();
      } catch (e) {
        thrown = e as Error;
      }
      return null;
    }
    harness.render(<ThrowProbe />);
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/DashboardBoundsProvider/);
  });
});
