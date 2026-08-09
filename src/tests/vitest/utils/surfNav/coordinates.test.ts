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
import { latlong_to_lps } from "../../../../utils/surf-nav/coordinates";

describe("Surf-nav coordinates tests", () => {
  it("Lat/Long -> LPS, 1m accuracy", () => {
    const lps = latlong_to_lps(-89.0, -133.0);
    expect(Math.abs(477955.408 - lps.e_lps)).toBeLessThanOrEqual(1);
    expect(Math.abs(479442.086 - lps.n_lps)).toBeLessThanOrEqual(1);
  });
});
