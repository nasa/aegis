/**
 * Tests for repositionRexMenuPanel, the logic that re-anchors the floating Rex Menu widget
 * (Positions + Assets tabs) to the current map bounds. Dockview has no public API to move a
 * floating group's x/y in place, so this works by removing and recreating the two panels when
 * the desired bounds differ from the current ones — these tests exercise that against a minimal
 * fake DockviewApi rather than a real dockview instance.
 */
import type { DockviewApi } from "dockview-react";
import {
  repositionRexMenuPanel,
  createRexMenuPanels,
} from "components/interface/map/overlays/rex-menu";

type AddPanelOptions = Parameters<DockviewApi["addPanel"]>[0];

type FakeGroup = {
  api: {
    boundingBox: { left: number; top: number; width: number; height: number };
    isVisible: boolean;
    setVisible: (value: boolean) => void;
  };
  activePanel?: { id: string };
};

type FakePanel = { id: string; group: FakeGroup };

function createFakeApi() {
  const panels = new Map<string, FakePanel>();
  let group: FakeGroup | null = null;

  const addPanel = vi.fn((options: AddPanelOptions): FakePanel => {
    const floating = options.floating && options.floating !== true ? options.floating : undefined;
    if (floating) {
      group = {
        api: {
          boundingBox: {
            left: floating.x!,
            top: floating.y!,
            width: floating.width!,
            height: floating.height!,
          },
          isVisible: true,
          setVisible: vi.fn((value: boolean) => {
            group!.api.isVisible = value;
          }),
        },
        activePanel: undefined,
      };
    }
    const panel: FakePanel = { id: options.id, group: group! };
    panels.set(options.id, panel);
    if (!options.inactive) group!.activePanel = panel;
    return panel;
  });

  const removePanel = vi.fn((panel: FakePanel) => {
    panels.delete(panel.id);
  });

  const getPanel = vi.fn((id: string) => panels.get(id));

  const api = { getPanel, removePanel, addPanel } as unknown as DockviewApi;
  return { api, getPanel, removePanel, addPanel, panels };
}

const MAP_BOUNDS_WIDE = { left: 0, top: 0, width: 1000, height: 800 };

// Seeds an already-open widget through the real createRexMenuPanels, so each test starts from
// the same state production code would leave behind (including the last-applied-bounds tracking
// repositionRexMenuPanel relies on) before exercising a reposition.
function seedInitialPanels(
  api: DockviewApi,
  bounds: { x: number; y: number; width: number; height: number }
) {
  createRexMenuPanels(api, bounds);
}

describe("repositionRexMenuPanel", () => {
  test("is a no-op when the widget has not been created yet", () => {
    const { api, removePanel, addPanel } = createFakeApi();
    expect(() => repositionRexMenuPanel(api, MAP_BOUNDS_WIDE)).not.toThrow();
    expect(removePanel).not.toHaveBeenCalled();
    expect(addPanel).not.toHaveBeenCalled();
  });

  test("leaves the widget alone when the map bounds have not moved it", () => {
    const { api, removePanel, addPanel } = createFakeApi();
    seedInitialPanels(api, { x: 606, y: 10, width: 384, height: 320 });
    addPanel.mockClear();

    repositionRexMenuPanel(api, MAP_BOUNDS_WIDE);
    expect(removePanel).not.toHaveBeenCalled();
    expect(addPanel).not.toHaveBeenCalled();
  });

  test("re-anchors to the top-right of the map when the map area shrinks (e.g. right panel opens)", () => {
    const { api, panels } = createFakeApi();
    seedInitialPanels(api, { x: 606, y: 10, width: 384, height: 320 });
    const initialBounds = panels.get("positions")!.group.api.boundingBox;

    // The right panel opening narrows the map by 480px.
    const narrowedBounds = { left: 0, top: 0, width: 520, height: 800 };
    repositionRexMenuPanel(api, narrowedBounds);

    const repositioned = panels.get("positions")!.group.api.boundingBox;
    expect(repositioned.left).toBeLessThan(initialBounds.left + initialBounds.width);
    expect(repositioned.left + repositioned.width).toBeLessThanOrEqual(narrowedBounds.width);
  });

  test("never shrinks the widget below the enforced minimum size, even on a narrow map", () => {
    const { api, panels } = createFakeApi();
    seedInitialPanels(api, { x: 606, y: 10, width: 384, height: 320 });

    const tinyMapBounds = { left: 0, top: 0, width: 200, height: 150 };
    repositionRexMenuPanel(api, tinyMapBounds);

    const bounds = panels.get("positions")!.group.api.boundingBox;
    expect(bounds.width).toBe(325);
    expect(bounds.height).toBe(318);
  });

  test("preserves minimized visibility and the active tab across a reposition", () => {
    const { api, panels } = createFakeApi();
    seedInitialPanels(api, { x: 606, y: 10, width: 384, height: 320 });
    const group = panels.get("positions")!.group;
    group.api.setVisible(false);
    group.activePanel = panels.get("assets")!;

    const narrowedBounds = { left: 0, top: 0, width: 520, height: 800 };
    repositionRexMenuPanel(api, narrowedBounds);

    const recreatedGroup = panels.get("positions")!.group;
    expect(recreatedGroup.api.isVisible).toBe(false);
    expect(recreatedGroup.activePanel?.id).toBe("assets");
  });

  // Regression test for a hang on REX selection: dockview's real floating-group positioning can
  // render a boundingBox that never exactly matches the bounds we requested (its own internal
  // clamping). repositionRexMenuPanel used to compare against that rendered boundingBox, so a
  // persistent mismatch meant every call recreated the panels, which re-fires the layout-change
  // event that calls repositionRexMenuPanel again — forever. It must instead compare against the
  // bounds it last *requested*, so a second call with the same mapBounds is always a no-op
  // regardless of how the fake (or dockview) chooses to render the result.
  test("does not recreate the widget on a second call with unchanged map bounds, even when the rendered boundingBox never matches the requested bounds", () => {
    const { api, panels, removePanel, addPanel } = createFakeApi();
    seedInitialPanels(api, { x: 606, y: 10, width: 384, height: 320 });

    // Simulate dockview's own clamping always rendering a fixed box regardless of what was
    // requested, i.e. a boundingBox that can never match our computed "desired" bounds.
    const clampedBox = { left: 0, top: 900, width: 100, height: 72 };
    panels.get("positions")!.group.api.boundingBox = clampedBox;

    const mapBounds = { left: 0, top: 0, width: 520, height: 800 };
    repositionRexMenuPanel(api, mapBounds);
    addPanel.mockClear();
    removePanel.mockClear();
    panels.get("positions")!.group.api.boundingBox = clampedBox;

    repositionRexMenuPanel(api, mapBounds);
    expect(removePanel).not.toHaveBeenCalled();
    expect(addPanel).not.toHaveBeenCalled();
  });
});
