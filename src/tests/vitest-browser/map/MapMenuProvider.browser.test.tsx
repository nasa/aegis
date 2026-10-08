/**
 * Browser-mode tests for `MapMenuProvider`.
 *
 * Covers:
 *  - default settings shape and values
 *  - setters mutate state visible to consumers
 *  - cookie persistence (writes to AEGIS_Map_Menu_Settings)
 *  - cookie load on mount overrides defaults
 *  - missing cookie values fall back to defaults and the cookie is resaved
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
import {
  getCompatibleGridLabelInterval,
  MapMenuPosSourceSync,
} from "components/interface/map/overlays/map-menu";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

// Mutable mock Automerge doc for MapMenuPosSourceSync.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
}));

vi.mock("utils/useAppSelector", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAppSelector: <TSel,>(selector: (state: unknown) => TSel): TSel =>
    selector({ rex: { selectedRexUuid: "rex-1" } }),
}));

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
    expect(settings!.submenuPos.pathMode).toBe("merged");
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
    // Cookie predates `pathMode`, so it falls back to the default.
    expect(settings!.submenuPos.pathMode).toBe("merged");
    expect(settings!.submenuPos.showAllLabels).toBe(true);
  });

  it("creates the cookie with every default value when there is no cookie", () => {
    function Probe(): null {
      useMapMenuContext();
      return null;
    }
    harness.render(withCookies(<Probe />));

    const cookieValue = cookies.get("AEGIS_Map_Menu_Settings");
    expect(cookieValue).toMatchObject({
      submenuStations: { show: true, showLabels: false, showWalkbacks: true, showCircles: true },
      submenuPois: { show: true, showLabels: false },
      submenuActions: { show: true, showLabels: false },
      submenuPos: { show: true, sourceUuids: [], pathMode: "merged" },
      showArrows: true,
      showBearings: true,
      showDistances: true,
      showScaleBar: true,
      showMouseLatLon: true,
      showSunEarth: false,
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
    });
  });

  it("keeps saved values, fills missing ones with defaults, and resaves the cookie", () => {
    const savedCookies = new Cookies();
    savedCookies.set(
      "AEGIS_Map_Menu_Settings",
      {
        // Missing: showLabels, showWalkbacks, showCircles
        submenuStations: { show: false },
        // Missing: pathMode and most other fields
        submenuPos: { sourceUuids: ["src-ser"], showPaths: false },
        showArrows: false,
        gridSpacingMode: 100,
        // Missing: every other top-level setting
      },
      { path: "/" }
    );
    let settings: MapMenuSettings | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      return null;
    }
    harness.render(withCookies(<Probe />, savedCookies));

    // Saved values are kept
    expect(settings!.submenuStations.show).toBe(false);
    expect(settings!.submenuPos.sourceUuids).toEqual(["src-ser"]);
    expect(settings!.submenuPos.showPaths).toBe(false);
    expect(settings!.showArrows).toBe(false);
    expect(settings!.gridSpacingMode).toBe(100);
    // Missing values get defaults
    expect(settings!.submenuStations.showWalkbacks).toBe(true);
    expect(settings!.submenuPos.pathMode).toBe("merged");
    expect(settings!.submenuPos.showMarkers).toBe(true);
    expect(settings!.submenuPois).toEqual({ show: true, showLabels: false });
    expect(settings!.showBearings).toBe(true);
    expect(settings!.showSunEarth).toBe(false);
    expect(settings!.gridLabelInterval).toBe("auto");

    // The cookie is rewritten with the complete settings
    const cookieValue = savedCookies.get("AEGIS_Map_Menu_Settings");
    expect(cookieValue.submenuStations).toEqual({
      show: false,
      showLabels: false,
      showWalkbacks: true,
      showCircles: true,
    });
    expect(cookieValue.submenuPos.pathMode).toBe("merged");
    expect(cookieValue.submenuPos.sourceUuids).toEqual(["src-ser"]);
    expect(cookieValue.showBearings).toBe(true);
    expect(cookieValue.gridSpacingMode).toBe(100);
  });

  it("replaces invalid saved values with defaults", () => {
    const savedCookies = new Cookies();
    savedCookies.set(
      "AEGIS_Map_Menu_Settings",
      { showArrows: "yes", gridSpacingMode: 5, submenuPos: { show: null } },
      { path: "/" }
    );
    let settings: MapMenuSettings | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      return null;
    }
    harness.render(withCookies(<Probe />, savedCookies));

    expect(settings!.showArrows).toBe(true);
    expect(settings!.gridSpacingMode).toBe("auto");
    expect(settings!.submenuPos.show).toBe(true);
  });

  it("persists submenuPos.pathMode to the cookie", () => {
    let setters: MapMenuSetters | null = null;
    function Probe(): null {
      setters = useMapMenuSetters();
      return null;
    }
    harness.render(withCookies(<Probe />));

    flushSync(() => setters!.setSubmenuPos((current) => ({ ...current, pathMode: "separate" })));

    const cookieValue = cookies.get("AEGIS_Map_Menu_Settings");
    expect(cookieValue.submenuPos.pathMode).toBe("separate");
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

describe("MapMenuPosSourceSync", () => {
  const crew: PosSource = { uuid: "src-crew", name: "Crew", abbr: "C", pathColor: "#ff0000" };
  const task: PosSource = { uuid: "src-task", name: "Task", abbr: "T", pathColor: "#009CE0" };
  const ser: PosSource = { uuid: "src-ser", name: "SER", abbr: "S", pathColor: "#68BC00" };

  function setRexPosSources(posSources: PosSource[]): void {
    mockMissionDoc.rexes = { "rex-1": { uuid: "rex-1", posSources } as Rex };
  }

  afterEach(() => {
    delete mockMissionDoc.rexes;
  });

  it("keeps the user's source selection when a source's fields change", () => {
    setRexPosSources([crew, task, ser]);
    let settings: MapMenuSettings | null = null;
    let setters: MapMenuSetters | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      setters = useMapMenuSetters();
      return null;
    }
    const tree = () =>
      withCookies(
        <>
          <MapMenuPosSourceSync />
          <Probe />
        </>
      );
    harness.render(tree());

    flushSync(() =>
      setters!.setSubmenuPos((current) => ({
        ...current,
        sourceUuids: [ser.uuid],
        pathMode: "separate",
      }))
    );

    setRexPosSources([crew, task, { ...ser, pathColor: "#FFFFFF" }]);
    harness.render(tree());

    expect(settings!.submenuPos.sourceUuids).toEqual([ser.uuid]);
    expect(settings!.submenuPos.pathMode).toBe("separate");
  });

  it("selects Task + Crew by default when there is no cookie", async () => {
    setRexPosSources([crew, task, ser]);
    let settings: MapMenuSettings | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      return null;
    }
    const tree = () =>
      withCookies(
        <>
          <MapMenuPosSourceSync />
          <Probe />
        </>
      );
    harness.render(tree());
    await new Promise((r) => setTimeout(r, 0));
    harness.render(tree());

    expect(settings!.submenuPos.sourceUuids).toEqual([task.uuid, crew.uuid]);
  });

  it("keeps the cookie's source selection on load, even if it belongs to another REX", async () => {
    setRexPosSources([crew, task, ser]);
    const savedCookies = new Cookies();
    savedCookies.set(
      "AEGIS_Map_Menu_Settings",
      {
        submenuPos: {
          show: true,
          showAllLabels: false,
          showLatestLabels: true,
          showPaths: true,
          showOldPaths: true,
          fadeOldPaths: true,
          showMarkers: true,
          showOldMarkers: true,
          fadeOldMarkers: true,
          sourceUuids: ["other-rex-source"],
          pathMode: "separate",
        },
      },
      { path: "/" }
    );
    let settings: MapMenuSettings | null = null;
    function Probe(): null {
      settings = useMapMenuContext();
      return null;
    }
    const tree = () =>
      withCookies(
        <>
          <MapMenuPosSourceSync />
          <Probe />
        </>,
        savedCookies
      );
    harness.render(tree());
    await new Promise((r) => setTimeout(r, 0));
    harness.render(tree());

    expect(settings!.submenuPos.sourceUuids).toEqual(["other-rex-source"]);
    expect(settings!.submenuPos.pathMode).toBe("separate");
  });
});
