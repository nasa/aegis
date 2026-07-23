/**
 * Helpers for synthesising OL map events in browser-mode tests.
 *
 * OL handlers registered via `map.on("click", ...)` receive a `MapBrowserEvent`
 * whose pixel/coordinate fields are read by the click handlers under test.
 * In a real browser the event is built by `MapBrowserEventHandler` from a
 * pointer event, but for unit-style behavior tests we don't have one, so we
 * dispatch a structurally-compatible object directly through `dispatchEvent`.
 *
 * The cast layer hides the OL `BaseEvent` interface (which our handlers
 * never look at) so callers don't have to write the cast every time.
 */
import type Map from "ol/Map";

type MapDispatchArg = Parameters<Map["dispatchEvent"]>[0];

export function dispatchMapClick(
  map: Map,
  pixel: [number, number],
  coordinate: [number, number]
): void {
  map.dispatchEvent({
    type: "click",
    target: map,
    propagationStopped: false,
    pixel,
    coordinate,
    preventDefault(): void {},
    stopPropagation(): void {},
  } as unknown as MapDispatchArg);
}
