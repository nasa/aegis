/**
 * Browser-mode tests for `MapMenuProvider`.
 *
 * Covers:
 *  - default settings shape and values
 *  - setters mutate state visible to consumers
 *  - cookie persistence (writes to AEGIS_Map_Menu_Settings)
 *  - cookie load on mount overrides defaults
 *  - useMapDisplaySetters throws outside provider
 *
 * The provider uses `react-cookie`, so each test wraps in <CookiesProvider>
 * with a fresh `Cookies` instance to isolate cookie state across tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushSync } from "react-dom";
import { CookiesProvider, Cookies } from "react-cookie";
import {
  MapMenuProvider,
  useMapMenuContext,
  useMapMenuSetters,
  type MapMenuSettings,
  type MapMenuSetters,
} from "components/interface/map/MapMenuProvider";
import { getCompatibleGridLabelInterval } from "components/interface/map/overlays/map-menu";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

let harness: ReactHarness;
let cookies: Cookies;

beforeEach(() => {
  harness = createReactHarness();
  // Each test gets its own Cookies instance — react-cookie also writes to
  // document.cookie though, so clear that too.
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

function withCookies(
  children: React.ReactNode,
  cookiesOverride: Cookies = cookies
): React.ReactElement {
  return (
    <CookiesProvider cookies={cookiesOverride}>
      <MapMenuProvider>{children}</MapMenuProvider>
    </CookiesProvider>
  );
}

describe("MapMenuProvider — defaults", () => {
  it("provides default display settings on first mount (no cookie)", () => {
    let settings: MapMenuSettings | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      return null;
    }

    harness.render(withCookies(<Probe />));

    expect(settings).not.toBeNull();
    expect(settings!.showArrows).toBe(true);
    expect(settings!.showScaleBar).toBe(true);
    expect(settings!.showMouseLatLon).toBe(true);
    expect(settings!.showSunEarth).toBe(false);
    expect(settings!.submenuStations.show).toBe(true);
    expect(settings!.submenuStations.showLabels).toBe(false);
    expect(settings!.submenuStations.showWalkbacks).toBe(true);
    expect(settings!.submenuStations.showCircles).toBe(true);
    expect(settings!.submenuPois.show).toBe(true);
    expect(settings!.submenuActions.show).toBe(true);
    expect(settings!.submenuPos.showAllLabels).toBe(false);
    expect(settings!.submenuPos.showLatestLabels).toBe(true);
  });

  it("setters are exposed and update consumer-visible settings", () => {
    let settings: MapMenuSettings | null = null;
    let setters: MapMenuSetters | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      setters = useMapMenuSetters();
      return null;
    }

    harness.render(withCookies(<Probe />));
    expect(settings!.showScaleBar).toBe(true);

    flushSync(() => setters!.setShowScaleBar(false));
    expect(settings!.showScaleBar).toBe(false);

    flushSync(() => setters!.setShowSunEarth(true));
    expect(settings!.showSunEarth).toBe(true);

    flushSync(() => setters!.setSubmenuStations((s) => ({ ...s, show: false })));
    expect(settings!.submenuStations.show).toBe(false);
  });
});

describe("grid label interval compatibility", () => {
  it("promotes a finer fixed label interval when grid spacing becomes coarser", () => {
    expect(getCompatibleGridLabelInterval(1000, 100)).toBe(1000);
    expect(getCompatibleGridLabelInterval(1000, "auto")).toBe("auto");
    expect(getCompatibleGridLabelInterval("auto", 100)).toBe("auto");
  });
});

describe("MapMenuProvider — cookie persistence", () => {
  it("writes settings to AEGIS_Map_Menu_Settings cookie on mount", () => {
    function Probe(): null {
      useMapMenuContext();
      return null;
    }
    harness.render(withCookies(<Probe />));

    const cookieValue = cookies.get("AEGIS_Map_Menu_Settings");
    expect(cookieValue).toBeTruthy();
    // react-cookie auto-parses JSON; expect an object with the persisted keys
    expect(cookieValue.showScaleBar).toBe(true);
    expect(cookieValue.showSunEarth).toBe(false);
    expect(cookieValue.submenuStations.show).toBe(true);
  });

  it("writes a persistent cookie (maxAge set) so settings survive a browser restart", () => {
    const setSpy = vi.spyOn(cookies, "set");
    function Probe(): null {
      useMapMenuContext();
      return null;
    }
    harness.render(withCookies(<Probe />));

    const persistWrite = setSpy.mock.calls.find(([name]) => name === "AEGIS_Map_Menu_Settings");
    expect(persistWrite).toBeTruthy();
    const options = persistWrite![2] as { maxAge?: number };
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it("updates the cookie when a setter changes a value", () => {
    let setters: MapMenuSetters | null = null;
    function Probe(): null {
      setters = useMapMenuSetters();
      return null;
    }
    harness.render(withCookies(<Probe />));

    flushSync(() => setters!.setShowSunEarth(true));

    const cookieValue = cookies.get("AEGIS_Map_Menu_Settings");
    expect(cookieValue.showSunEarth).toBe(true);
  });

  it("loads existing cookie on mount and overrides defaults", async () => {
    // Pre-seed a cookie before mounting
    const savedCookies = new Cookies();
    savedCookies.set(
      "AEGIS_Map_Menu_Settings",
      {
        submenuPois: { show: false, showLabels: true },
        submenuStations: {
          show: false,
          showLabels: true,
          showWalkbacks: false,
          showCircles: false,
        },
        submenuActions: { show: false, showLabels: false },
        submenuPos: {
          show: false,
          showAllLabels: true,
          showLatestLabels: false,
          showPaths: false,
          showOldPaths: false,
          fadeOldPaths: false,
          showMarkers: false,
          showOldMarkers: false,
          fadeOldMarkers: false,
          sourceUuids: [],
        },
        showArrows: false,
        showSunEarth: true,
        showScaleBar: false,
        showMouseLatLon: false,
      },
      { path: "/" }
    );

    let settings: MapMenuSettings | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      return null;
    }
    harness.render(withCookies(<Probe />, savedCookies));

    // Cookie load happens in useEffect, then setStates flush in a follow-up
    // render. Wait one microtask + re-render to drain pending updates.
    await new Promise((r) => setTimeout(r, 0));
    harness.render(withCookies(<Probe />, savedCookies));

    expect(settings!.showArrows).toBe(false);
    expect(settings!.showSunEarth).toBe(true);
    expect(settings!.showScaleBar).toBe(false);
    expect(settings!.showMouseLatLon).toBe(false);
    expect(settings!.submenuStations.show).toBe(false);
    expect(settings!.submenuStations.showLabels).toBe(true);
    expect(settings!.submenuPois.show).toBe(false);
  });
});

describe("MapMenuProvider — error cases", () => {
  it("useMapDisplaySetters throws when used outside provider", () => {
    let thrown: Error | null = null;
    function ThrowProbe(): null {
      try {
        useMapMenuSetters();
      } catch (e) {
        thrown = e as Error;
      }
      return null;
    }
    harness.render(<ThrowProbe />);
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/MapMenuProvider/);
  });

  it("useMapDisplay throws when used outside provider", () => {
    let thrown: Error | null = null;
    function ThrowProbe(): null {
      try {
        useMapMenuContext();
      } catch (e) {
        thrown = e as Error;
      }
      return null;
    }
    harness.render(<ThrowProbe />);
    expect(thrown).not.toBeNull();
    expect(thrown!.message).toMatch(/MapMenuProvider/);
  });
});
