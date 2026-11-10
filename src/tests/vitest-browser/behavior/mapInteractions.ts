import { afterEach, expect } from "vitest";
import type SimpleGeometry from "ol/geom/SimpleGeometry";
import type VectorLayer from "ol/layer/Vector";
import { readMapFeatures } from "./mapObserver";
import type { BrowserPage } from "vitest/browser";
import { isVisible } from "./browserAssertions";

export async function minimizeRexMenu(page: BrowserPage): Promise<void> {
  const minimize = page.getByTestId("rex-menu-minimize");
  if (isVisible(minimize)) await minimize.click();
}

const errorObservers = new Set<() => void>();
afterEach(() => {
  for (const dispose of errorObservers) dispose();
  errorObservers.clear();
});

export function recordBrowserErrors(errors: string[]): void {
  const listener = (event: ErrorEvent) => errors.push(event.error?.message ?? event.message);
  window.addEventListener("error", listener);
  errorObservers.add(() => window.removeEventListener("error", listener));
}

export async function waitForMapIdle(): Promise<void> {
  await expect
    .poll(
      () =>
        window.__aegisMaps
          ?.filter((entry) => entry.map.getTargetElement()?.isConnected)
          .every((entry) => !entry.map.getView().getAnimating()) ?? false
    )
    .toBe(true);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

export function mapFeaturePixel(
  id: string,
  mode: MapMode = "editor",
  vertexIndex = 0
): { x: number; y: number } {
  const map = window.__aegisMaps?.find(
    (entry) => entry.mode === mode && entry.map.getTargetElement()?.isConnected
  )?.map;
  if (!map) throw new Error(`No observed ${mode} map`);
  for (const layer of map.getLayers().getArray()) {
    const source = (layer as VectorLayer).getSource?.();
    if (!source || !("getFeatureById" in source)) continue;
    const feature = source.getFeatureById(id);
    if (!feature) continue;
    const geometry = feature.getGeometry() as SimpleGeometry;
    const coordinates = geometry.getCoordinates();
    const coordinate = geometry.getType() === "LineString" ? coordinates[vertexIndex] : coordinates;
    const pixel = map.getPixelFromCoordinate(coordinate);
    const bounds = map.getTargetElement().getBoundingClientRect();
    return { x: bounds.left + pixel[0], y: bounds.top + pixel[1] };
  }
  throw new Error(`Feature ${id} is absent from ${mode} map`);
}

export async function expectMapLabel(text: string, mode: MapMode = "editor"): Promise<void> {
  await expect
    .poll(() =>
      readMapFeatures(mode)
        .filter((feature) => feature.labelType && feature.visible)
        .map((feature) => feature.name)
    )
    .toContain(text);
}
