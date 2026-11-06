import "vitest/browser";

declare global {
  type MapPointerAction = "move" | "down" | "up" | "click" | "dblclick" | "wheel";
  type MapDirectiveTestTarget = "poi" | "station" | "action" | "walkback" | "traverse" | "position";
  type MapDirectiveTestExit = "Escape" | "Edit off" | "navigation";
}

declare module "vitest/browser" {
  interface BrowserCommands {
    mapPointer(action: MapPointerAction, x?: number, y?: number, steps?: number): Promise<void>;
  }
}
