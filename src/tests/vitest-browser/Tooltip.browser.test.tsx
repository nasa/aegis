/**
 * Browser-mode test for react-tooltip.
 *
 * Notes on triggering the tooltip in tests:
 *   - react-tooltip v6 attaches a **delegated** `mouseover` listener to
 *     `document` (not `mouseenter`, which does not bubble). To simulate a
 *     hover we dispatch a bubbling `MouseEvent("mouseover")` on the anchor.
 *   - The tooltip element is portaled into `document.body` and its `id`
 *     matches the `id` prop passed to `<Tooltip>`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Tooltip } from "react-tooltip";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

let harness: ReactHarness;

beforeEach(() => {
  harness = createReactHarness();
});

afterEach(() => {
  harness.unmount();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate a hover onto `el`. react-tooltip v6 listens for `mouseover` on
 * `document` and derives "entered a new anchor" from `event.target` vs
 * `event.relatedTarget`. `mouseover` bubbles, so document-level delegation
 * works; `mouseenter` does not bubble and is not what the library uses.
 */
function hover(el: Element) {
  el.dispatchEvent(
    new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
      relatedTarget: document.body,
    })
  );
}

/**
 * Simulate the pointer leaving `el`. Mirrors the library's delegated
 * `mouseout` listener; `relatedTarget` must be outside the anchor so the
 * library does not treat it as a same-anchor movement.
 */
function unhover(el: Element) {
  el.dispatchEvent(
    new MouseEvent("mouseout", {
      bubbles: true,
      cancelable: true,
      relatedTarget: document.body,
    })
  );
}

/**
 * Return the tooltip element rendered by react-tooltip.
 *
 * react-tooltip v6 renders a `<div role="tooltip">` (with class
 * "react-tooltip") portaled into `document.body`, with its `id` set to the
 * value passed via the `id` prop. Querying by id is the most precise
 * selector because multiple Tooltip instances can coexist.
 */
function getTooltipEl(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
}

/**
 * Whether the tooltip is currently visible.
 *
 * react-tooltip v6 signals "showing/shown" by adding the `react-tooltip__show`
 * class, and "hiding/hidden" by adding `react-tooltip__closing` (or by
 * removing the show class). It does NOT toggle `aria-hidden` or `display`.
 */
function isTooltipVisible(el: HTMLElement): boolean {
  if (el.classList.contains("react-tooltip__closing")) return false;
  if (!el.classList.contains("react-tooltip__show")) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("react-tooltip", () => {
  it("Pattern 1: shows tooltip from `data-tooltip-content` on hover and hides on un-hover", async () => {
    // Mirrors the global `aegis-tooltip` pattern used throughout the app:
    // a single <Tooltip id="aegis-tooltip"> and many anchors that just set
    // data-tooltip-id + data-tooltip-content.
    const tooltipId = "test-tooltip-data-content";
    const expectedText = "Unsaved changes";

    harness.render(
      <>
        <Tooltip id={tooltipId} delayShow={0} delayHide={0} />
        <button
          data-tooltip-id={tooltipId}
          data-tooltip-content={expectedText}
          aria-label="hover target"
        >
          Hover me
        </button>
      </>
    );

    const anchor = harness.container.querySelector("[aria-label='hover target']")!;
    expect(anchor).not.toBeNull();

    hover(anchor);

    let tooltipEl!: HTMLElement;
    await vi.waitFor(() => {
      tooltipEl = getTooltipEl(tooltipId)!;
      expect(tooltipEl).not.toBeNull();
      expect(tooltipEl.textContent).toContain(expectedText);
      expect(isTooltipVisible(tooltipEl)).toBe(true);
    });

    unhover(anchor);

    await vi.waitFor(() => {
      // Element stays mounted but should transition to hidden (loses the
      // `react-tooltip__show` class and gains `react-tooltip__closing`).
      expect(isTooltipVisible(tooltipEl)).toBe(false);
    });
  });

  it("Pattern 2: shows tooltip with custom child JSX", async () => {
    // Mirrors custom HTML implementation for tooltips. Ex:
    // `header.tsx` -> <Tooltip id="interface-header-usercount">
    const tooltipId = "test-tooltip-children";

    harness.render(
      <>
        <Tooltip id={tooltipId} delayShow={0} delayHide={0}>
          <div>Users active in this Mission:</div>
          <div>Editors: 3</div>
          <div>Visitors: 5</div>
        </Tooltip>
        <div data-tooltip-id={tooltipId} aria-label="usercount target">
          user count
        </div>
      </>
    );

    const anchor = harness.container.querySelector("[aria-label='usercount target']")!;
    expect(anchor).not.toBeNull();

    hover(anchor);

    await vi.waitFor(() => {
      const tooltipEl = getTooltipEl(tooltipId);
      expect(tooltipEl).not.toBeNull();
      expect(tooltipEl!.textContent).toContain("Users active in this Mission:");
      expect(tooltipEl!.textContent).toContain("Editors: 3");
      expect(tooltipEl!.textContent).toContain("Visitors: 5");
      expect(isTooltipVisible(tooltipEl!)).toBe(true);
    });
  });
});
