import { getGridBearingInCrs, getLgrsGridBearing } from "utils/lgrs/bearing";
import {
  classifyLatLon,
  getLtmCentralMeridian,
  getLtmCrsId,
  getLtmZone,
  LGRS_CRS_LPS_NORTH,
  LGRS_CRS_LPS_SOUTH,
} from "utils/lgrs/moon/crs";
import { projectLatLon } from "utils/lgrs/moon/projection";
import { moonGridSystem } from "utils/lgrs/moon/system";
import {
  SURF_NAV_LPS_FALSE_EAST,
  SURF_NAV_LPS_FALSE_NORTH,
  SURF_NAV_MOON_K0,
  SURF_NAV_MOON_MEAN_RADIUS,
} from "utils/consts";
import { range_bearing_from_xy } from "utils/surf-nav/orienteering";

import { createSeededRandom } from "../../helpers/seededRandom";

const DEG = Math.PI / 180;
const out = new Float64Array(2);
const outB = new Float64Array(2);

/** Frozen copy of the pre-0.4.0 `latLonToSouthLps` projection, kept as the south reference. */
function oldSouthLps({ lat, lng }: AEGISPoint): [number, number] {
  const latitude = (lat * Math.PI) / 180;
  const longitude = (lng * Math.PI) / 180;
  const originLatitude = (-90 * Math.PI) / 180;
  const scale =
    (2 * SURF_NAV_MOON_K0) /
    (1 +
      Math.sin(originLatitude) * Math.sin(latitude) +
      Math.cos(originLatitude) * Math.cos(latitude) * Math.cos(longitude));
  const normalize = (value: number) =>
    Math.abs(value - Math.round(value)) <= 1e-9 ? Math.round(value) : value;
  return [
    normalize(
      SURF_NAV_MOON_MEAN_RADIUS * scale * Math.cos(latitude) * Math.sin(longitude) +
        SURF_NAV_LPS_FALSE_EAST
    ),
    normalize(
      SURF_NAV_MOON_MEAN_RADIUS *
        scale *
        (Math.cos(originLatitude) * Math.sin(latitude) -
          Math.sin(originLatitude) * Math.cos(latitude) * Math.cos(longitude)) +
        SURF_NAV_LPS_FALSE_NORTH
    ),
  ];
}

/** The pre-0.4.0 south bearing path: surf-nav planar bearing on the old south projection. */
function oldSouthBearing(origin: AEGISPoint, destination: AEGISPoint): number {
  const a = oldSouthLps(origin);
  const b = oldSouthLps(destination);
  const { range, bearing } = range_bearing_from_xy(b[0], b[1], a[0], a[1]);
  if (range === 0) return 0;
  return bearing >= 360 ? bearing - 360 : bearing;
}

/** Outputs of the pre-change `getBearingFromLatLngPoints`, captured before the rewire. */
const SOUTH_GOLDEN: [AEGISPoint, AEGISPoint, number][] = [
  [{ lat: -89, lng: -133 }, { lat: -89.001, lng: -132.9 }, 346.8744979025195],
  [{ lat: -89.5, lng: 0 }, { lat: -89.5, lng: 180 }, 180],
  [{ lat: -85, lng: 2 }, { lat: -85.2, lng: 2.5 }, 170.19589298724014],
  [{ lat: -89.9, lng: 45 }, { lat: -89.95, lng: -135 }, 225],
  [{ lat: -80, lng: -60 }, { lat: -81.5, lng: -58.25 }, 110.2524151036685],
  [{ lat: -87.123456, lng: 101.5 }, { lat: -87.12, lng: 101.51 }, 109.77198053112969],
  [{ lat: -90, lng: 0 }, { lat: -88, lng: 30 }, 30.00000000000003],
  [{ lat: -84.6, lng: 179.9 }, { lat: -84.6, lng: -179.9 }, 270],
  [{ lat: -86.5, lng: -10 }, { lat: -79.5, lng: -10 }, 350],
];

/** Oracle formula: atan2(dE, dN) in the origin's CRS. */
function oracleBearing(origin: AEGISPoint, destination: AEGISPoint): number {
  const crs = classifyLatLon(origin.lat, origin.lng);
  expect(projectLatLon(origin.lat, origin.lng, crs, out)).toBe(true);
  expect(projectLatLon(destination.lat, destination.lng, crs, outB)).toBe(true);
  const bearing = Math.atan2(outB[0] - out[0], outB[1] - out[1]) / DEG;
  return bearing < 0 ? bearing + 360 : bearing;
}

function angleDifference(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/** Great-circle initial azimuth from true north. */
function trueAzimuth(origin: AEGISPoint, destination: AEGISPoint): number {
  const lat1 = origin.lat * DEG;
  const lat2 = destination.lat * DEG;
  const dLon = (destination.lng - origin.lng) * DEG;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const azimuth = Math.atan2(y, x) / DEG;
  return azimuth < 0 ? azimuth + 360 : azimuth;
}

describe("getLgrsGridBearing() south LPS", () => {
  test.each(SOUTH_GOLDEN)("%j -> %j matches the pre-change bearing", (origin, destination, old) => {
    expect(getLgrsGridBearing(moonGridSystem, origin, destination)).toBe(old);
  });

  test("is bit-identical to the old south path for random south-cap segments", () => {
    const random = createSeededRandom(20261105);
    for (let i = 0; i < 4000; i++) {
      const origin = { lat: -90 + random() * 10, lng: random() * 360 - 180 };
      // Mix of short (metres to km) and long (cross-cap, up to the cap edge) segments.
      const destination =
        i % 4 === 0
          ? { lat: -90 + random() * 10, lng: random() * 360 - 180 }
          : {
              lat: Math.max(-90, origin.lat + (random() - 0.5) * 0.2 * random()),
              lng: origin.lng + (random() - 0.5) * 2 * random(),
            };
      const actual = getLgrsGridBearing(moonGridSystem, origin, destination);
      const expected = oldSouthBearing(origin, destination);
      if (!Object.is(actual, expected)) {
        expect.fail(`${JSON.stringify([origin, destination])}: ${actual} !== ${expected}`);
      }
      expect(actual >= 0 && actual < 360).toBe(true);
    }
  });
});

describe("getLgrsGridBearing() LTM", () => {
  test("uses the zone's grid: true azimuth minus meridian convergence", () => {
    const random = createSeededRandom(42);
    for (let i = 0; i < 500; i++) {
      const origin = { lat: random() * 158 - 79, lng: random() * 360 - 180 };
      const destination = {
        lat: origin.lat + (random() - 0.5) * 1e-4,
        lng: origin.lng + (random() - 0.5) * 1e-4,
      };
      const crs = classifyLatLon(origin.lat, origin.lng);
      const dLon = (origin.lng - getLtmCentralMeridian(getLtmZone(crs))) * DEG;
      const convergence = Math.atan(Math.tan(dLon) * Math.sin(origin.lat * DEG)) / DEG;
      const actual = getLgrsGridBearing(moonGridSystem, origin, destination);
      expect(angleDifference(actual, trueAzimuth(origin, destination) - convergence)).toBeLessThan(
        1e-5
      );
      expect(angleDifference(actual, oracleBearing(origin, destination))).toBeLessThan(1e-9);
    }
  });

  test("reads 0/90/180/270 along the central meridian and the equator", () => {
    const cm = getLtmCentralMeridian(23);
    expect(getLgrsGridBearing(moonGridSystem, { lat: 10, lng: cm }, { lat: 10.5, lng: cm })).toBe(
      0
    );
    expect(getLgrsGridBearing(moonGridSystem, { lat: 10, lng: cm }, { lat: 9.5, lng: cm })).toBe(
      180
    );
    expect(getLgrsGridBearing(moonGridSystem, { lat: 0, lng: cm }, { lat: 0, lng: cm + 1 })).toBe(
      90
    );
    expect(getLgrsGridBearing(moonGridSystem, { lat: 0, lng: cm }, { lat: 0, lng: cm - 1 })).toBe(
      270
    );
  });

  test("projects a destination across a zone meridian into the origin's zone", () => {
    // Zone 24 is [4, 12); the destination lies in zone 25.
    const origin = { lat: 30, lng: 11.9 };
    const destination = { lat: 30.05, lng: 12.1 };
    expect(classifyLatLon(origin.lat, origin.lng)).toBe(getLtmCrsId(24, "N"));
    expect(classifyLatLon(destination.lat, destination.lng)).toBe(getLtmCrsId(25, "N"));
    const actual = getLgrsGridBearing(moonGridSystem, origin, destination);
    expect(actual).toBe(
      getGridBearingInCrs(moonGridSystem, origin, destination, getLtmCrsId(24, "N"))
    );
    expect(actual).not.toBe(
      getGridBearingInCrs(moonGridSystem, origin, destination, getLtmCrsId(25, "N"))
    );
    expect(angleDifference(actual, oracleBearing(origin, destination))).toBeLessThan(1e-9);
  });

  test("is continuous across the equator", () => {
    const cm = getLtmCentralMeridian(5);
    expect(
      getLgrsGridBearing(moonGridSystem, { lat: 0.01, lng: cm }, { lat: -0.01, lng: cm })
    ).toBe(180);
    expect(
      getLgrsGridBearing(moonGridSystem, { lat: -0.01, lng: cm }, { lat: 0.01, lng: cm })
    ).toBe(0);
    const north = getLgrsGridBearing(
      moonGridSystem,
      { lat: 0.01, lng: cm + 3 },
      { lat: -0.01, lng: cm + 3.01 }
    );
    const south = getLgrsGridBearing(
      moonGridSystem,
      { lat: -0.01, lng: cm + 3.01 },
      { lat: 0.01, lng: cm + 3 }
    );
    expect(angleDifference(north, south)).toBeCloseTo(180, 4);
  });
});

describe("getLgrsGridBearing() across ±80° and LPS N", () => {
  test("uses LTM below 80° and LPS from 80°", () => {
    const cm = getLtmCentralMeridian(27);
    expect(getLgrsGridBearing(moonGridSystem, { lat: 79.9, lng: cm }, { lat: 80.1, lng: cm })).toBe(
      0
    );
    expect(
      getLgrsGridBearing(moonGridSystem, { lat: -79.9, lng: cm }, { lat: -80.1, lng: cm })
    ).toBe(180);
    for (const [origin, destination, crs] of [
      [{ lat: 79.9, lng: 33 }, { lat: 80.1, lng: 33.5 }, getLtmCrsId(27, "N")],
      [{ lat: -79.9, lng: 33 }, { lat: -80.1, lng: 33.5 }, getLtmCrsId(27, "S")],
      [{ lat: 80.1, lng: 33 }, { lat: 79.9, lng: 33.5 }, LGRS_CRS_LPS_NORTH],
      [{ lat: -80.1, lng: 33 }, { lat: -79.9, lng: 33.5 }, LGRS_CRS_LPS_SOUTH],
    ] as const) {
      const actual = getLgrsGridBearing(moonGridSystem, origin, destination);
      expect(actual).toBe(getGridBearingInCrs(moonGridSystem, origin, destination, crs));
      expect(angleDifference(actual, oracleBearing(origin, destination))).toBeLessThan(1e-9);
    }
  });

  test("north LPS grid north points toward the pole along lon 0", () => {
    expect(getLgrsGridBearing(moonGridSystem, { lat: 85, lng: 0 }, { lat: 86, lng: 0 })).toBe(0);
    expect(getLgrsGridBearing(moonGridSystem, { lat: 85, lng: 90 }, { lat: 86, lng: 90 })).toBe(
      270
    );
    expect(getLgrsGridBearing(moonGridSystem, { lat: 89.5, lng: 0 }, { lat: 89.5, lng: 180 })).toBe(
      0
    );
  });

  test("matches the oracle formula for random LPS N segments", () => {
    const random = createSeededRandom(99);
    for (let i = 0; i < 500; i++) {
      const origin = { lat: 80 + random() * 10, lng: random() * 360 - 180 };
      const destination = { lat: 80 + random() * 10, lng: random() * 360 - 180 };
      expect(
        angleDifference(
          getLgrsGridBearing(moonGridSystem, origin, destination),
          oracleBearing(origin, destination)
        )
      ).toBeLessThan(1e-9);
    }
  });
});

describe("getLgrsGridBearing() edge cases", () => {
  const valid = { lat: -89, lng: 10 };

  test.each([
    { lat: NaN, lng: 0 },
    { lat: 0, lng: NaN },
    { lat: 91, lng: 0 },
    { lat: -90.5, lng: 0 },
    { lat: 0, lng: 400 },
    { lat: 0, lng: Infinity },
  ])("returns NaN for invalid point %j", (invalid) => {
    expect(getLgrsGridBearing(moonGridSystem, invalid, valid)).toBeNaN();
    expect(getLgrsGridBearing(moonGridSystem, valid, invalid)).toBeNaN();
  });

  test("returns NaN when the destination cannot be projected into the origin's CRS", () => {
    // 90° from an LTM central meridian on the equator is a TM singularity.
    const cm = getLtmCentralMeridian(23);
    expect(
      getLgrsGridBearing(moonGridSystem, { lat: 0, lng: cm }, { lat: 0, lng: cm + 90 })
    ).toBeNaN();
  });

  test.each([
    { lat: -89, lng: -133 },
    { lat: -90, lng: 0 },
    { lat: 12.5, lng: 101 },
    { lat: -45, lng: -179.99 },
    { lat: 86, lng: 47 },
  ])("returns 0 for a zero-length segment at %j", (point) => {
    expect(getLgrsGridBearing(moonGridSystem, point, { ...point })).toBe(0);
  });

  test("uses south LPS for crs 0 regardless of latitude", () => {
    const origin = { lat: 35.5, lng: -111.727 };
    const destination = { lat: 35.5, lng: -111.717 };
    expect(getGridBearingInCrs(moonGridSystem, origin, destination, LGRS_CRS_LPS_SOUTH)).toBe(
      oldSouthBearing(origin, destination)
    );
  });
});
