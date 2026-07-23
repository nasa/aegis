/* eslint-disable react-hooks/globals */
/**
 * Browser-mode tests for `MapProvider`.
 *
 * MapProvider wraps `useMissionDocSelector` (Automerge) so we mock it to
 * return a minimal projection config. This lets us verify the Map lifecycle
 * without a real mission document.
 *
 * Mocks:
 *  - `utils/useDocSelector` — returns a minimal EPSG:3857 projConfig
 *
 * Verifies:
 *  - `useMap()` throws when called outside a provider
 *  - `useMap()` returns the map instance inside `<MapProvider>`
 *  - The OL map uses the correct projection
 *  - The map is disposed and detached from the DOM on unmount
 *  - The map target element is the container div
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Component, useRef, type ReactNode } from "react";
import Map from "ol/Map";

import { MapProvider, useMapContext } from "components/interface/map/MapProvider";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

// ---------------------------------------------------------------------------
// Module mock — minimal EPSG:3857 (Earth/Mercator) projConfig
// ---------------------------------------------------------------------------

const mockProjConfig: {
  id: number;
  projIsCustom: boolean;
  projEpsg: string;
  projProj4String: string | null;
  projResUnitsPerPixel: number | null;
  projResZoomLevel: number | null;
  projOriginX: number | null;
  projOriginY: number | null;
  projBoundsMinX: number | null;
  projBoundsMinY: number | null;
  projBoundsMaxX: number | null;
  projBoundsMaxY: number | null;
  landerLocation: { lat: number; lng: number };
  initialZoom: number;
} = {
  id: 22,
  projIsCustom: false,
  projEpsg: "EPSG:3857",
  projProj4String: null,
  projResUnitsPerPixel: null,
  projResZoomLevel: null,
  projOriginX: null,
  projOriginY: null,
  projBoundsMinX: null,
  projBoundsMinY: null,
  projBoundsMaxX: null,
  projBoundsMaxY: null,
  landerLocation: { lat: 0, lng: 0 },
  initialZoom: 4,
};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockProjConfig),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Inline ErrorBoundary (react-error-boundary not installed)
// ---------------------------------------------------------------------------

interface BoundaryState {
  error: Error | null;
}

class SimpleErrorBoundary extends Component<
  { children: ReactNode; onError: (err: Error) => void },
  BoundaryState
> {
  constructor(props: { children: ReactNode; onError: (err: Error) => void }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    if (this.state.error) return null;
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let mapContainer: HTMLDivElement;

/** Wraps MapProvider with a ref pointing at the pre-created mapContainer. */
function ProviderWrapper({
  children,
  mode = "editor",
}: {
  children: ReactNode;
  mode?: "editor" | "dashboard" | "minimap";
}) {
  const containerRef = useRef<HTMLDivElement | null>(mapContainer);
  return (
    <MapProvider containerRef={containerRef} mode={mode}>
      {children}
    </MapProvider>
  );
}

let capturedMap: Map | null = null;

function MapCapture(): null {
  const { map } = useMapContext();
  capturedMap = map;
  return null;
}

let caughtError: Error | null = null;

function ThrowingChild(): null {
  useMapContext(); // throws — no MapContext.Provider above
  return null;
}

beforeEach(() => {
  capturedMap = null;
  caughtError = null;
  harness = createReactHarness();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);
});

afterEach(() => {
  harness.unmount();
  mapContainer.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MapProvider", () => {
  it("useMap() throws when called outside MapProvider", () => {
    // Suppress React error boundary console.error output for this intentional error
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    harness.render(
      <SimpleErrorBoundary onError={(err) => (caughtError = err)}>
        <ThrowingChild />
      </SimpleErrorBoundary>
    );

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toMatch(/useMap\(\) must be used within/i);

    consoleErrorSpy.mockRestore();
  });

  it("useMap() returns the map instance inside MapProvider", async () => {
    harness.render(
      <ProviderWrapper mode="editor">
        <MapCapture />
      </ProviderWrapper>
    );

    await vi.waitFor(() => {
      expect(capturedMap).not.toBeNull();
    });

    expect(capturedMap).toBeInstanceOf(Map);
  });

  it("the created map uses the EPSG:3857 projection", async () => {
    harness.render(
      <ProviderWrapper mode="editor">
        <MapCapture />
      </ProviderWrapper>
    );

    await vi.waitFor(() => {
      expect(capturedMap).not.toBeNull();
    });

    const projCode = capturedMap!.getView().getProjection().getCode();
    expect(projCode).toBe("EPSG:3857");
  });

  it("map target element is the container div", async () => {
    harness.render(
      <ProviderWrapper mode="editor">
        <MapCapture />
      </ProviderWrapper>
    );

    await vi.waitFor(() => {
      expect(capturedMap).not.toBeNull();
    });

    expect(capturedMap!.getTargetElement()).toBe(mapContainer);
  });

  it("map is disposed and detached from the DOM on unmount", async () => {
    harness.render(
      <ProviderWrapper mode="editor">
        <MapCapture />
      </ProviderWrapper>
    );

    await vi.waitFor(() => {
      expect(capturedMap).not.toBeNull();
    });

    const map = capturedMap!;
    const disposeSpy = vi.spyOn(map, "dispose");
    const setTargetSpy = vi.spyOn(map, "setTarget");

    harness.unmount();
    harness = createReactHarness();

    expect(setTargetSpy).toHaveBeenCalledWith(undefined);
    expect(disposeSpy).toHaveBeenCalled();
  });
});
