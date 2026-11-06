import { createLgrsRenderPlan } from "utils/lgrs/grid/plan";
import { getGridBindingKey, getLgrsGridBinding } from "utils/lgrs/gridBinding";
import { getLgrsMapProjector } from "utils/lgrs/mapProjection";
import { getLtmCrsId, LGRS_CRS_LPS_SOUTH } from "utils/lgrs/moon/crs";
import { moonGridSystem } from "utils/lgrs/moon/system";

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const SOUTH_CAP: LgrsMapProjection = {
  projCode: "BINDING:S",
  proj4Def: `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`,
};
const EQC: LgrsMapProjection = {
  projCode: "BINDING:EQC",
  proj4Def: `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`,
};

/** The Moon under another key, with overridable members. */
function moonVariant(key: string, overrides: Partial<LgrsGridSystem> = {}): LgrsGridSystem {
  return { ...moonGridSystem, key, ...overrides };
}

const out = new Float64Array(2);
const other = new Float64Array(2);

describe("getLgrsMapProjector", () => {
  test("caches one projector per map projection", () => {
    expect(getLgrsMapProjector(SOUTH_CAP)).toBe(getLgrsMapProjector({ ...SOUTH_CAP }));
    expect(getLgrsMapProjector(SOUTH_CAP)).not.toBe(getLgrsMapProjector(EQC));
  });
});

describe("getLgrsGridBinding", () => {
  test("caches bindings by projection and system key", () => {
    const variant = moonVariant("test-moon-variant");
    const moon = getLgrsGridBinding(SOUTH_CAP, moonGridSystem);
    expect(getLgrsGridBinding({ ...SOUTH_CAP }, moonGridSystem)).toBe(moon);
    expect(getLgrsGridBinding(SOUTH_CAP, variant)).not.toBe(moon);
    expect(getLgrsGridBinding(SOUTH_CAP, variant)).toBe(getLgrsGridBinding(SOUTH_CAP, variant));
    expect(getLgrsGridBinding(SOUTH_CAP, variant).system).toBe(variant);
    expect(getGridBindingKey(SOUTH_CAP, moonGridSystem)).not.toBe(
      getGridBindingKey(SOUTH_CAP, variant)
    );
  });

  test("exposes the projector's conversions unchanged", () => {
    const binding = getLgrsGridBinding(SOUTH_CAP, moonGridSystem);
    const projector = getLgrsMapProjector(SOUTH_CAP);
    expect(binding.fastPath).toBe(projector.fastPath);
    expect(binding.worldWidth).toBe(projector.worldWidth);
    expect(binding.latLonToMap(-85, 30, out)).toBe(projector.latLonToMap(-85, 30, other));
    expect([...out]).toEqual([...other]);
    expect(binding.mapToLatLon(1000, -2000, out)).toBe(projector.mapToLatLon(1000, -2000, other));
    expect([...out]).toEqual([...other]);
  });

  test("does not cache a projection proj4 cannot build", () => {
    const bad = { projCode: "BINDING:BAD", proj4Def: `+proj=tmerc +lat_0=0 +lon_0=0 ${MOON}` };
    const binding = getLgrsGridBinding(bad, moonGridSystem);
    expect(getLgrsGridBinding(bad, moonGridSystem)).not.toBe(binding);
    expect(binding.mapToGrid(0, 0, LGRS_CRS_LPS_SOUTH, out)).toBe(false);
    expect(binding.gridToMap(500000, 500000, LGRS_CRS_LPS_SOUTH, out)).toBe(false);
  });

  test("validates CRS ids with the bound system", () => {
    const lpsOnly = moonVariant("test-moon-lps-only", {
      isValidCrs: (crs) => crs === 0 || crs === 1,
    });
    const crs = getLtmCrsId(23, "N");
    expect(getLgrsGridBinding(EQC, moonGridSystem).mapToGrid(1000, 2000, crs, out)).toBe(true);
    const binding = getLgrsGridBinding(EQC, lpsOnly);
    expect(binding.mapToGrid(1000, 2000, crs, out)).toBe(false);
    expect(binding.gridToMap(250000, 1000, crs, out)).toBe(false);
    expect(binding.getAffine(crs)).toBeNull();
    expect(binding.mapToGrid(0, 0, -1, out)).toBe(false);
  });

  test("takes affine relations from the system, otherwise goes through lat/lon", () => {
    const affine = getLgrsGridBinding(SOUTH_CAP, moonGridSystem);
    expect(affine.getAffine(LGRS_CRS_LPS_SOUTH)).toMatchObject({ scale: 0.994 });

    const noAffine = getLgrsGridBinding(
      SOUTH_CAP,
      moonVariant("test-moon-no-affine", { getAffine: () => null })
    );
    expect(noAffine.getAffine(LGRS_CRS_LPS_SOUTH)).toBeNull();
    expect(noAffine.mapToGrid(12345, -6789, LGRS_CRS_LPS_SOUTH, out)).toBe(true);
    noAffine.mapToLatLon(12345, -6789, other);
    moonGridSystem.projectLatLon(other[0], other[1], LGRS_CRS_LPS_SOUTH, other);
    expect([...out]).toEqual([...other]);
    expect(noAffine.gridToMap(out[0], out[1], LGRS_CRS_LPS_SOUTH, other)).toBe(true);
    expect(other[0]).toBeCloseTo(12345, 6);
    expect(other[1]).toBeCloseTo(-6789, 6);
  });
});

describe("createLgrsRenderPlan with the bound system", () => {
  function hemisphereView(binding: LgrsGridBinding): LgrsRenderOptions {
    return {
      binding,
      extent: [-960 * 2500, -540 * 2500, 960 * 2500, 540 * 2500],
      resolution: 2500,
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
      labelsVisible: true,
    };
  }

  test("hides the zone tier for a system that does not draw one", () => {
    expect(createLgrsRenderPlan(hemisphereView(getLgrsGridBinding(EQC, moonGridSystem))).tier).toBe(
      "zone"
    );
    const hidden = moonVariant("test-moon-no-zone-tier", { drawsZoneTier: false });
    const plan = createLgrsRenderPlan(hemisphereView(getLgrsGridBinding(EQC, hidden)));
    expect(plan.tier).toBe("none");
    expect(plan.lines).toEqual([]);
    expect(plan.labels).toEqual([]);
  });

  test("labels boxes with the system's box formatter", () => {
    const tagged = moonVariant("test-moon-tagged-labels", {
      formatBox: (e, n, crs, precision) => {
        const label = moonGridSystem.formatBox(e, n, crs, precision);
        return label && { ...label, text: `T ${label.text}` };
      },
    });
    const binding = getLgrsGridBinding(SOUTH_CAP, tagged);
    const plan = createLgrsRenderPlan({
      binding,
      extent: [-4800, -2700, 4800, 2700],
      resolution: 5,
      gridSpacingMode: "auto",
      gridLabelInterval: "auto",
      labelsVisible: true,
    });
    expect(plan.tier).toBe("box");
    expect(plan.labels.length).toBeGreaterThan(0);
    expect(plan.labels.every((label) => label.text.startsWith("T "))).toBe(true);
  });
});
