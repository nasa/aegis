import { afterEach, beforeEach, describe, expect, it } from "vitest";
import SlopeLegend from "components/interface/slope-legend";
import { SLOPE_CLASSES } from "utils/paperSlope";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

describe("SlopeLegend", () => {
  let harness: ReactHarness;

  beforeEach(() => {
    harness = createReactHarness();
    harness.render(<SlopeLegend />);
  });

  afterEach(() => harness.unmount());

  it("opens the accessible key dialog with both rows and every shared range", () => {
    const button = document.querySelector("button");
    expect(button?.textContent).toBe("Key");
    expect(button?.getAttribute("aria-haspopup")).toBe("dialog");

    button?.click();
    const dialog = document.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    const headingId = dialog?.getAttribute("aria-labelledby");
    expect(headingId).toBeTruthy();
    expect(document.getElementById(headingId)).not.toBeNull();
    expect(document.body.textContent).toContain("Path Grade · Terrain Slope");
    expect(document.body.textContent).toContain("Slope color = absolute degrees");
    for (const slopeClass of SLOPE_CLASSES) {
      expect(document.body.textContent).toContain(slopeClass.label);
      const swatch = document.querySelector(`[title="${slopeClass.label}"]`) as HTMLElement;
      expect(swatch).not.toBeNull();
      expect(swatch.style.backgroundColor).not.toBe("");
    }
  });

  it("closes with Escape and a backdrop click", () => {
    const button = document.querySelector("button");
    const dialog = document.querySelector("dialog") as HTMLDialogElement;

    button?.click();
    dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
    expect(dialog.open).toBe(false);

    button?.click();
    dialog.click();
    expect(dialog.open).toBe(false);
  });
});
