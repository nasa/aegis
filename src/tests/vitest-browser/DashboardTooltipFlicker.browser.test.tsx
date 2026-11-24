/**
 * Reproduction harness for the dashboard tooltip flicker.
 *
 * The dashboard re-renders its timeline every 100 ms from the PET interval.
 * Conditionally rendered nodes in that subtree add and remove DOM elements on
 * each tick, which react-tooltip's document-wide MutationObserver treats as an
 * anchor-registry change. This asserts that an open tooltip survives that
 * churn.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEffect, useState } from "react";
import Tooltip from "components/interface/aegis-tooltip";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

let harness: ReactHarness;

beforeEach(() => {
  harness = createReactHarness();
});

afterEach(() => {
  harness.unmount();
});

function hover(el: Element) {
  el.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, cancelable: true, relatedTarget: document.body })
  );
}

const getTooltipEl = (id: string) => document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);

const isTooltipVisible = (el: HTMLElement | null): boolean =>
  !!el &&
  el.classList.contains("react-tooltip__show") &&
  !el.classList.contains("react-tooltip__closing");

/**
 * Stands in for the dashboard timeline: a sibling subtree that re-renders on a
 * fast timer and adds/removes nodes as its conditional branches flip.
 */
const TickingSubtree = ({ onTick }: { onTick?: () => void }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 20);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    onTick?.();
  }, [tick, onTick]);
  return (
    <div>
      {/* Mirrors timelineMarker's `if (seconds <= 0) return null` and
          activities' `{!complete && ...}`: nodes appear and disappear. */}
      {tick % 2 === 0 && <div>marker</div>}
      {tick % 3 === 0 && <div data-tooltip-id="flicker-tooltip" data-tooltip-content="other" />}
      <div style={{ top: `${tick}px` }}>{tick}</div>
    </div>
  );
};

describe("dashboard tooltip stability", () => {
  it("keeps an open tooltip visible while a sibling subtree churns the DOM", async () => {
    const tooltipId = "flicker-tooltip";

    harness.render(
      <>
        <Tooltip id={tooltipId} delayShow={0} delayHide={500} clickable={true} />
        <button data-tooltip-id={tooltipId} data-tooltip-content="Total dwell time (h:mm)">
          Hover me
        </button>
        <TickingSubtree />
      </>
    );

    const anchor = harness.container.querySelector("button")!;
    hover(anchor);

    await vi.waitFor(() => {
      expect(isTooltipVisible(getTooltipEl(tooltipId))).toBe(true);
    });

    // Sample across many subtree mutations; the tooltip must never drop out.
    const samples: boolean[] = [];
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      samples.push(isTooltipVisible(getTooltipEl(tooltipId)));
    }

    expect(samples.every(Boolean)).toBe(true);
  });

  it("keeps an open tooltip visible when its own subtree re-renders on the PET tick", async () => {
    const tooltipId = "flicker-tooltip-rerender";

    const Ticking = () => {
      const [tick, setTick] = useState(0);
      useEffect(() => {
        const timer = setInterval(() => setTick((value) => value + 1), 20);
        return () => clearInterval(timer);
      }, []);
      return (
        <>
          {/* The app's dashboard tooltip props. */}
          <Tooltip id={tooltipId} delayShow={1000} delayHide={500} clickable={true} />
          <div style={{ top: `${tick}px` }}>
            {tick % 2 === 0 && <div>churn</div>}
            <button data-tooltip-id={tooltipId} data-tooltip-content="Total dwell time (h:mm)">
              Hover me
            </button>
          </div>
        </>
      );
    };

    harness.render(<Ticking />);
    hover(harness.container.querySelector("button")!);

    await vi.waitFor(
      () => {
        expect(isTooltipVisible(getTooltipEl(tooltipId))).toBe(true);
      },
      { timeout: 4000 }
    );

    const samples: boolean[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      samples.push(isTooltipVisible(getTooltipEl(tooltipId)));
    }

    expect(samples.every(Boolean)).toBe(true);
  });

  it("keeps an open tooltip visible when a sibling toggles its data-tooltip-id", async () => {
    const tooltipId = "flicker-tooltip-attr";

    const Toggling = () => {
      const [tick, setTick] = useState(0);
      useEffect(() => {
        const timer = setInterval(() => setTick((value) => value + 1), 20);
        return () => clearInterval(timer);
      }, []);
      return (
        <>
          <Tooltip id={tooltipId} delayShow={0} delayHide={500} clickable={true} />
          <button data-tooltip-id={tooltipId} data-tooltip-content="dwell">
            Hover me
          </button>
          {/* Mirrors map-menu's `data-tooltip-id={disabled ? "aegis-tooltip" : undefined}`,
              which adds and removes the attribute the observer filters on. */}
          <div
            data-tooltip-id={tick % 2 === 0 ? tooltipId : undefined}
            data-tooltip-content={tick % 2 === 0 ? "grid" : undefined}
          >
            toggling sibling
          </div>
        </>
      );
    };

    harness.render(<Toggling />);
    hover(harness.container.querySelector("button")!);

    await vi.waitFor(() => {
      expect(isTooltipVisible(getTooltipEl(tooltipId))).toBe(true);
    });

    const samples: boolean[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      samples.push(isTooltipVisible(getTooltipEl(tooltipId)));
    }

    expect(samples.every(Boolean)).toBe(true);
  });

  it("keeps an open tooltip visible when its row moves between table groups", async () => {
    const tooltipId = "flicker-tooltip-regroup";

    /**
     * Mirrors the Rex position table: rows are split into "Latest" and "Older"
     * tbody groups, and a new arrival pushes a row from one group into the
     * other. React cannot move DOM between parents, so the row is destroyed
     * and recreated even though its key is unchanged.
     */
    const Regrouping = () => {
      const [arrivals, setArrivals] = useState(0);
      useEffect(() => {
        const timer = setInterval(() => setArrivals((value) => value + 1), 150);
        return () => clearInterval(timer);
      }, []);
      const rows = ["row-a", "row-b"];
      const latest = arrivals % 2 === 0 ? rows.slice(0, 1) : [];
      const older = arrivals % 2 === 0 ? rows.slice(1) : rows;
      const renderRow = (uuid: string) => (
        <tr key={uuid}>
          <td data-tooltip-id={tooltipId} data-tooltip-content="Lander Distance (m)">
            {uuid}
          </td>
        </tr>
      );
      return (
        <>
          <Tooltip id={tooltipId} delayShow={0} delayHide={500} clickable={true} />
          <table>
            <tbody data-testid="latest">{latest.map(renderRow)}</tbody>
            <tbody data-testid="older">{older.map(renderRow)}</tbody>
          </table>
        </>
      );
    };

    harness.render(<Regrouping />);
    hover(harness.container.querySelector("td")!);

    await vi.waitFor(() => {
      expect(isTooltipVisible(getTooltipEl(tooltipId))).toBe(true);
    });

    const samples: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      samples.push(isTooltipVisible(getTooltipEl(tooltipId)));
    }

    expect(samples.every(Boolean)).toBe(true);
  });

  it("keeps an open tooltip visible when the anchor remounts on the PET tick", async () => {
    const tooltipId = "flicker-tooltip-remount";

    const Remounting = () => {
      const [tick, setTick] = useState(0);
      useEffect(() => {
        // The dashboard PET interval cadence.
        const timer = setInterval(() => setTick((value) => value + 1), 100);
        return () => clearInterval(timer);
      }, []);
      return (
        <>
          <Tooltip id={tooltipId} delayShow={0} delayHide={500} clickable={true} />
          {/* A changing key forces React to drop and recreate the anchor's DOM
              node on every tick, the worst case for anchor replacement. */}
          <button key={tick} data-tooltip-id={tooltipId} data-tooltip-content="dwell">
            Hover me
          </button>
        </>
      );
    };

    harness.render(<Remounting />);
    hover(harness.container.querySelector("button")!);

    await vi.waitFor(() => {
      expect(isTooltipVisible(getTooltipEl(tooltipId))).toBe(true);
    });

    const samples: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      samples.push(isTooltipVisible(getTooltipEl(tooltipId)));
    }

    expect(samples.every(Boolean)).toBe(true);
  });
});
