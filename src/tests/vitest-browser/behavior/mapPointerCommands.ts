import type { BrowserCommand } from "vitest/node";
import type {} from "@vitest/browser-playwright";

/** Coordinates come from the test iframe; the provider mouse uses the containing page. */
const mapPointer: BrowserCommand<
  [action: MapPointerAction, x?: number, y?: number, steps?: number]
> = async ({ page, frame }, action, x, y, steps) => {
  if (action === "down") return page.mouse.down();
  if (action === "up") return page.mouse.up();
  if (action === "wheel") return page.mouse.wheel(x ?? 0, y ?? 0);
  if (x === undefined || y === undefined) throw new Error("Pointer coordinates are required");
  const testFrame = await frame();
  const bounds = await (await testFrame.frameElement()).boundingBox();
  if (!bounds) throw new Error("The test iframe is not visible");
  const viewport = await testFrame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const point = {
    x: bounds.x + (x * bounds.width) / viewport.width,
    y: bounds.y + (y * bounds.height) / viewport.height,
  };
  if (action === "move") return page.mouse.move(point.x, point.y, { steps });
  if (action === "dblclick") return page.mouse.dblclick(point.x, point.y);
  return page.mouse.click(point.x, point.y);
};

export const mapPointerCommands = { mapPointer };
