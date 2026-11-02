/**
 * Browser-mode tests for the floating widgets in `MissionDockviewLayout`.
 *
 * Regression coverage for: resizing the floating Rex Menu widget from its edges let it grow past
 * the map onto the left/right/bottom panels. Dockview clamps floating-group resizing only to its
 * floating overlay host, which it sizes to the whole layout; the layout now pins that host to the
 * map panel's rect.
 */

import { page } from "vitest/browser";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MissionDockviewLayout } from "components/interface/dockview/MissionDockviewLayout";
import { interfaceSlice, initialState as interfaceInitialState } from "store/interface";
import { rexSlice, initialState as rexInitialState } from "store/rex";
import { createReactHarness, type ReactHarness } from "../map/helpers/reactBrowserHarness";

const REX_UUID = "rex-uuid-floating-bounds-1";

const mockMissionDoc: Partial<Mission> = {
  rexes: { [REX_UUID]: { uuid: REX_UUID } as unknown as Mission["rexes"][string] },
};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

vi.mock("components/interface/side-controls", () => ({
  BottomDrawerTab: (): null => null,
  BottomControlPanel: (): null => null,
  LeftDrawerTab: (): null => null,
  LeftControlPanel: (): null => null,
  NavGutter: (): null => null,
  RightDrawerTab: (): null => null,
  RightControlPanel: (): null => null,
}));

vi.mock("components/interface/map/AegisMapEditor", () => ({
  AegisMapEditor: (): null => null,
}));

vi.mock("components/interface/map/overlays/map-menu-pos", () => ({
  MapPositionMenu: (): null => null,
}));

function makeStore() {
  return configureStore({
    reducer: {
      interface: interfaceSlice.reducer,
      rex: rexSlice.reducer,
    },
    preloadedState: {
      interface: { ...interfaceInitialState, sectionSelectedLabel: "evas" },
      rex: { ...rexInitialState, selectedRexUuid: REX_UUID },
    },
  });
}

let harness: ReactHarness;

function getRexMenuWidget(): HTMLElement | null {
  return (
    harness.container
      .querySelector("[data-testid='positions-floating-panel']")
      ?.closest<HTMLElement>(".dv-resize-container") ?? null
  );
}

function getMapRect(): DOMRect {
  return harness.container
    .querySelector<HTMLElement>("[data-testid='mission-panel-map']")!
    .getBoundingClientRect();
}

// Presses a resize handle, moves the pointer once at its starting point (dockview records the
// initial size on the first move), then moves it to the target point and releases.
function dragResizeHandle(handle: HTMLElement, target: { clientX: number; clientY: number }) {
  const handleRect = handle.getBoundingClientRect();
  const start = {
    clientX: handleRect.left + handleRect.width / 2,
    clientY: handleRect.top + handleRect.height / 2,
  };
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, ...start }));
  window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, ...start }));
  window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, ...target }));
  window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, ...target }));
}

beforeEach(async () => {
  await page.viewport(1600, 1000);
  harness = createReactHarness();
  harness.container.style.width = "1600px";
  harness.container.style.height = "1000px";
  harness.render(
    <Provider store={makeStore()}>
      <MissionDockviewLayout />
    </Provider>
  );
  await vi.waitFor(() => expect(getRexMenuWidget()).not.toBeNull());
});

afterEach(() => {
  harness.unmount();
});

describe("MissionDockviewLayout floating Rex Menu bounds", () => {
  it("opens inside the map panel", () => {
    const widgetRect = getRexMenuWidget()!.getBoundingClientRect();
    const mapRect = getMapRect();
    expect(widgetRect.left).toBeGreaterThanOrEqual(mapRect.left - 1);
    expect(widgetRect.top).toBeGreaterThanOrEqual(mapRect.top - 1);
    expect(widgetRect.right).toBeLessThanOrEqual(mapRect.right + 1);
    expect(widgetRect.bottom).toBeLessThanOrEqual(mapRect.bottom + 1);
  });

  it.each(["left", "right", "bottom", "top", "bottomleft", "topright"])(
    "cannot be resized past the map from the %s handle",
    (direction) => {
      const widget = getRexMenuWidget()!;
      const handle = widget.querySelector<HTMLElement>(`.dv-resize-handle-${direction}`)!;
      const widgetRect = widget.getBoundingClientRect();
      // Aim well beyond the viewport edge in the handle's direction.
      const target = {
        clientX: direction.includes("left")
          ? -500
          : direction.includes("right")
            ? 5000
            : widgetRect.left + widgetRect.width / 2,
        clientY: direction.includes("top")
          ? -500
          : direction.includes("bottom")
            ? 5000
            : widgetRect.top + widgetRect.height / 2,
      };

      dragResizeHandle(handle, target);

      const resizedRect = widget.getBoundingClientRect();
      const mapRect = getMapRect();
      expect(resizedRect.left).toBeGreaterThanOrEqual(mapRect.left - 1);
      expect(resizedRect.top).toBeGreaterThanOrEqual(mapRect.top - 1);
      expect(resizedRect.right).toBeLessThanOrEqual(mapRect.right + 1);
      expect(resizedRect.bottom).toBeLessThanOrEqual(mapRect.bottom + 1);
    }
  );
});
