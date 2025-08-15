/*
 * The following test cases should EXACTLY match the test cases from the surf_nav repo
 * They should ONLY be changed to match tests in the surf_nav repo.
 * You can access these tests in the surf_nav repo at:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav
 *
 * and the file these tests are in is:
 * https://gitlab.fit.nasa.gov/cm-artemis-integration/cm-ehp/surf-nav/-/blob/main/surf_nav/nav_tools/test/test_coordinates.py?ref_type=heads
 *
 * The following test cases are also EXPORT CONTROLLED! Authorization is required to export or reuse these items
 */
import {
  latlong_to_lps,
  lps_to_latlong,
  lps_to_gridzone,
  lps_to_polar_zone,
  lps_to_lgrs,
  lgrs_to_lps,
  lgrs_to_acc,
  acc_to_lgrs,
} from "../../../../utils/surf-nav/coordinates";

describe("Surf-nav coordinates tests", () => {
  it("Lat/Long -> LPS, 1m accuracy", () => {
    const lps = latlong_to_lps(-89.0, -133.0);
    expect(Math.abs(477955.408 - lps.e_lps)).toBeLessThanOrEqual(1);
    expect(Math.abs(479442.086 - lps.n_lps)).toBeLessThanOrEqual(1);
  });

  it("LPS -> Lat/Long, 0.1deg accuracy", () => {
    const latlng = lps_to_latlong(475020, 475020);
    expect(Math.abs(-88.804 - latlng.lat)).toBeLessThanOrEqual(1);
    expect(Math.abs(-135 - latlng.lng)).toBeLessThanOrEqual(1);
  });

  it("LPS -> Lat/Long at the south pole, total precision", () => {
    const latlng = lps_to_latlong(500000, 500000);
    expect(latlng.lat).toBe(-90);
    expect(latlng.lng).toBe(0);
  });

  it("LPS -> LGRS Gridzone", () => {
    const zone = lps_to_gridzone(475020, 475020);
    expect(zone).toBe("ZM");
  });

  it("LPS -> LGRS Gridzone, %25k = 0 condition, west of pole", () => {
    const zone = lps_to_gridzone(25000, 475020);
    expect(zone).toBe("FM");
  });

  it("LPS -> LGRS Gridzone west of pole", () => {
    const zone = lps_to_gridzone(525000, 475020);
    expect(zone).toBe("BM");
  });

  it("LPS -> LGRS Polar Zones", () => {
    const zone_east = lps_to_polar_zone(499999);
    expect(zone_east).toBe("A");
    const zone_west = lps_to_polar_zone(500000);
    expect(zone_west).toBe("B");
  });

  it("LPS -> LGRS Polar Zone", () => {
    const lgrs = lps_to_lgrs(543210, 412345);
    expect(lgrs.e_lgrs).toBe("18210");
    expect(lgrs.n_lgrs).toBe("12345");
  });

  it("LGRS -> LPS Polar Zone A", () => {
    const lps = lgrs_to_lps("24474", "19862", "ZL", "A");
    expect(lps.e_lps).toBe(499474);
    expect(lps.n_lps).toBe(469862);
  });

  it("LGRS -> LPS Polar Zone B", () => {
    const lps = lgrs_to_lps("00526", "05138", "AP", "B");
    expect(lps.e_lps).toBe(500526);
    expect(lps.n_lps).toBe(530138);
  });

  it("LGRS -> LPS at South Pole", () => {
    const lps = lgrs_to_lps("00000", "05138", "AP", "B");
    expect(lps.e_lps).toBe(500000);
    expect(lps.n_lps).toBe(530138);
  });

  it("LGRS -> ACC", () => {
    const acc = lgrs_to_acc("18210", "12345");
    expect(acc.e_acc).toBe("T210");
    expect(acc.n_acc).toBe("M345");
  });

  it("ACC -> LGRS", () => {
    const lgrs = acc_to_lgrs("T210", "M345");
    expect(lgrs.e_lgrs).toBe("18210");
    expect(lgrs.n_lgrs).toBe("12345");
  });
});
