/**
 * Browser-mode tests for the dashboard↔minimap eyeball-toggle bridge.
 *
 * DashboardMenuPublisher relays scale bar + arrows from the dashboard's
 * MapMenuProvider up into the shared DashboardBoundsProvider; MinimapMenuSubscriber
 * relays arrows from DashboardBoundsProvider down into the minimap's own
 * MapMenuProvider. Together they keep those two toggles in sync across the two
 * maps without sharing a single menu provider.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { flushSync } from "react-dom";
import { CookiesProvider, Cookies } from "react-cookie";
import {
  MapMenuProvider,
  useMapMenuContext,
  useMapMenuSetters,
  type MapMenuSetters,
  type MapMenuSettings,
} from "components/interface/map/MapMenuProvider";
import {
  DashboardBoundsProvider,
  useDashboardBoundsContext,
  type DashboardBoundsContextValue,
} from "components/interface/map/DashboardBoundsProvider";
import {
  DashboardMenuPublisher,
  MinimapMenuSubscriber,
} from "components/interface/map/MapMenuMinimapBridge";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

let harness: ReactHarness;
let cookies: Cookies;

beforeEach(() => {
  harness = createReactHarness();
  document.cookie.split(";").forEach((c) => {
    const eq = c.indexOf("=");
    const name = (eq > -1 ? c.substring(0, eq) : c).trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  cookies = new Cookies();
});

afterEach(() => {
  harness.unmount();
});

// The bridge relays values through a `useEffect`, so propagation lands one tick
// after the source setter. Drain the effect cascade before asserting.
async function flushEffects(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe("DashboardMenuPublisher", () => {
  it("publishes menu scale bar + arrows into DashboardBoundsProvider", async () => {
    let menuSetters: MapMenuSetters | null = null;
    let bounds: DashboardBoundsContextValue | null = null;

    function Probe(): null {
      menuSetters = useMapMenuSetters();
      bounds = useDashboardBoundsContext();
      return null;
    }

    harness.render(
      <CookiesProvider cookies={cookies}>
        <DashboardBoundsProvider>
          <MapMenuProvider>
            <DashboardMenuPublisher />
            <Probe />
          </MapMenuProvider>
        </DashboardBoundsProvider>
      </CookiesProvider>
    );

    // Publisher effect runs after mount and mirrors the menu defaults (true).
    expect(bounds!.showScaleBar).toBe(true);
    expect(bounds!.showArrows).toBe(true);

    flushSync(() => menuSetters!.setShowScaleBar(false));
    await flushEffects();
    expect(bounds!.showScaleBar).toBe(false);

    flushSync(() => menuSetters!.setShowArrows(false));
    await flushEffects();
    expect(bounds!.showArrows).toBe(false);
  });
});

describe("MinimapMenuSubscriber", () => {
  it("mirrors DashboardBoundsProvider arrows into the local MapMenuProvider", async () => {
    let bounds: DashboardBoundsContextValue | null = null;
    let menu: MapMenuSettings | null = null;

    function Probe(): null {
      bounds = useDashboardBoundsContext();
      menu = useMapMenuContext();
      return null;
    }

    harness.render(
      <CookiesProvider cookies={cookies}>
        <DashboardBoundsProvider>
          <MapMenuProvider>
            <MinimapMenuSubscriber />
            <Probe />
          </MapMenuProvider>
        </DashboardBoundsProvider>
      </CookiesProvider>
    );

    expect(menu!.showArrows).toBe(true);

    flushSync(() => bounds!.setShowArrows(false));
    await flushEffects();
    expect(menu!.showArrows).toBe(false);
  });
});
