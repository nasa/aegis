import {
  formatEarthAcc,
  formatEarthAccBoxLabel,
  formatEarthAccFromLatLon,
} from "utils/lgrs/earth/acc";
import { formatCanonicalMgrs } from "utils/lgrs/earth/mgrs";
import { projectEarthLatLon, unprojectEarthToLatLon } from "utils/lgrs/earth/projection";
import {
  classifyEarthLatLon,
  EARTH_CRS_UPS_NORTH,
  EARTH_CRS_UPS_SOUTH,
  getEarthLatitudeBandLetter,
  getUtmCrsId,
} from "utils/lgrs/earth/zones";

import { createSeededRandom } from "../../../helpers/seededRandom";

const out = new Float64Array(2);
const utm = (zone: number, hemisphere: LgrsHemisphere = "N") => getUtmCrsId(zone, hemisphere);

describe("formatEarthAccFromLatLon", () => {
  // Plan §3.4 worked examples.
  test.each([
    [29.5593, -95.09, "15RTNDC X51 W77", "X51 W77"],
    [29.25, -103.25, "13RFNCB V05 L95", "V05 L95"],
    [64.8, -17.0, "28WDSAD D99 M66", "D99 M66"],
    [0.0001, -179.9999, "1NAACA R03 -01", "R03 -01"],
  ] as const)("formats %s, %s as %s / %s", (lat, lon, full, condensed) => {
    expect(formatEarthAccFromLatLon(lat, lon, 10, "full")).toBe(full);
    expect(formatEarthAccFromLatLon(lat, lon, 10, "condensed")).toBe(condensed);
  });

  test("formats every precision", () => {
    expect(formatEarthAccFromLatLon(29.5593, -95.09, 25000, "full")).toBe("15RTNDC");
    expect(formatEarthAccFromLatLon(29.5593, -95.09, 25000, "condensed")).toBe("15RTNDC");
    expect(formatEarthAccFromLatLon(29.5593, -95.09, 1000, "full")).toBe("15RTNDC X W");
    expect(formatEarthAccFromLatLon(29.5593, -95.09, 1000, "condensed")).toBe("X W");
    expect(formatEarthAccFromLatLon(29.5593, -95.09, 100, "condensed")).toBe("X5 W7");
    expect(formatEarthAccFromLatLon(29.5593, -95.09, 1, "condensed")).toBe("X516 W776");
    expect(formatEarthAccFromLatLon(29.5593, -95.09, 10000 as EarthAccPrecision, "full")).toBe(
      null
    );
  });

  test("formats UPS points with the band first", () => {
    expect(formatEarthAccFromLatLon(90, 0, 10, "full")).toBe("ZAHAA -00 -00");
    expect(formatEarthAccFromLatLon(-90, 0, 10, "full")).toBe("BANAA -00 -00");
    expect(formatEarthAccFromLatLon(85, -45, 10, "full")).toBe("YUDAA G23 G23");
    expect(formatEarthAccFromLatLon(-88, 160, 10, "full")).toBe("BAKDD -95 R32");
  });

  test("shares the zone, band and square with canonical MGRS", () => {
    const random = createSeededRandom(2025);
    for (let i = 0; i < 3000; i++) {
      const lat = random() * 180 - 90;
      const lon = random() * 360 - 180;
      const acc = formatEarthAccFromLatLon(lat, lon, 25000, "full") as string;
      const [zoneBand, square] = (formatCanonicalMgrs(lat, lon, 100000) as string).split(" ");
      expect(acc.slice(0, -2)).toBe(zoneBand + square);
    }
  });

  test("returns null for invalid input", () => {
    expect(formatEarthAccFromLatLon(NaN, 0, 10, "full")).toBeNull();
    expect(formatEarthAccFromLatLon(-91, 0, 10, "full")).toBeNull();
  });
});

describe("formatEarthAcc (from E/N)", () => {
  test("is exact on 100 km, 25 km and 1 km lines", () => {
    expect(formatEarthAcc(utm(15), 300000, 3275000, 29.6, 10, "full")).toBe("15RUNAD -00 -00");
    expect(formatEarthAcc(utm(15), 299999.999999, 3274999.999999, 29.6, 10, "full")).toBe(
      "15RTNDC Z99 Z99"
    );
    expect(formatEarthAcc(utm(15), 276000, 3251000, 29.6, 1, "full")).toBe("15RTNDC A000 A000");
    expect(formatEarthAcc(utm(15), 275999.999, 3250999.999, 29.6, 1, "full")).toBe(
      "15RTNDC -999 -999"
    );
  });

  test("splits the UPS bands at the false easting", () => {
    expect(formatEarthAcc(EARTH_CRS_UPS_SOUTH, 2000000, 2000000, -90, 10, "full")).toBe(
      "BANAA -00 -00"
    );
    expect(formatEarthAcc(EARTH_CRS_UPS_SOUTH, 1999999.999, 2000000, -89.9, 10, "full")).toBe(
      "AZNDA Z99 -00"
    );
  });

  test("labels a point outside the crs region in that crs", () => {
    expect(formatEarthAcc(utm(15), 300000, 3275000, -0.1, 10, "full")).toBe("15MUNAD -00 -00");
    expect(formatEarthAcc(EARTH_CRS_UPS_NORTH, 2000000, 2000000, 80, 10, "full")).toBe(
      "ZAHAA -00 -00"
    );
  });

  test("rejects an invalid latitude or E/N outside the lettered squares", () => {
    expect(formatEarthAcc(utm(15), 300000, 3275000, 91, 10, "full")).toBeNull();
    expect(formatEarthAcc(utm(15), 50000, 3275000, 29.6, 10, "full")).toBeNull();
  });
});

describe("formatEarthAccBoxLabel", () => {
  test("labels a 10 m box from its corner", () => {
    expect(formatEarthAccBoxLabel(utm(15), 297510, 3271770, 10)).toEqual({
      lgrs: "15RTNDC22512177",
      acc: "15RTNDCX51W77",
      prefix: "15RTNDC",
      condensed: "X51W77",
      text: "X51 W77",
      lowerLeft: [297510, 3271770],
      precision: 10,
    });
  });

  test("labels every precision", () => {
    expect(formatEarthAccBoxLabel(utm(15), 275000, 3250000, 25000)).toEqual({
      lgrs: "15RTNDC",
      acc: "15RTNDC",
      prefix: "15RTNDC",
      condensed: "",
      text: "15RTNDC",
      lowerLeft: [275000, 3250000],
      precision: 25000,
    });
    const at1km = formatEarthAccBoxLabel(utm(15), 297516.44, 3271776.23, 1000);
    expect([at1km?.lgrs, at1km?.text, at1km?.lowerLeft]).toEqual([
      "15RTNDC2221",
      "X W",
      [297000, 3271000],
    ]);
    expect(formatEarthAccBoxLabel(utm(15), 297516.44, 3271776.23, 100)?.text).toBe("X5 W7");
    const at1m = formatEarthAccBoxLabel(utm(15), 297516.44, 3271776.23, 1);
    expect([at1m?.lgrs, at1m?.text]).toEqual(["15RTNDC2251621776", "X516 W776"]);
    expect(formatEarthAccBoxLabel(EARTH_CRS_UPS_NORTH, 2000000, 2000000, 25000)?.text).toBe(
      "ZAHAA"
    );
  });

  test("owns [k·p, (k+1)·p)", () => {
    expect(formatEarthAccBoxLabel(utm(15), 299999.999, 3274999.999, 25000)?.prefix).toBe("15RTNDC");
    expect(formatEarthAccBoxLabel(utm(15), 300000, 3275000, 25000)?.prefix).toBe("15RUNAD");
  });

  test("takes the band from the box centre", () => {
    expect(projectEarthLatLon(64, -15, utm(28), out)).toBe(true);
    const below = Math.floor(out[1] / 1000) * 1000 - 1000;
    expect(formatEarthAccBoxLabel(utm(28), 500000, below, 1000)?.prefix.slice(0, 3)).toBe("28V");
    expect(formatEarthAccBoxLabel(utm(28), 500000, below + 2000, 1000)?.prefix.slice(0, 3)).toBe(
      "28W"
    );
  });

  test("rejects invalid input", () => {
    expect(formatEarthAccBoxLabel(-1, 500000, 0, 10)).toBeNull();
    expect(formatEarthAccBoxLabel(utm(15), Infinity, 0, 10)).toBeNull();
    expect(formatEarthAccBoxLabel(utm(15), 500000, 0, 10000 as EarthAccPrecision)).toBeNull();
  });

  test("agrees with the point readout when the box and point share a band", () => {
    const random = createSeededRandom(1969);
    const precisions: EarthAccPrecision[] = [25000, 1000, 100, 10, 1];
    let compared = 0;
    for (let i = 0; i < 4000; i++) {
      const lat = random() * 180 - 90;
      const lon = random() * 360 - 180;
      const crs = classifyEarthLatLon(lat, lon);
      const precision = precisions[i % precisions.length];
      expect(projectEarthLatLon(lat, lon, crs, out)).toBe(true);
      const label = formatEarthAccBoxLabel(crs, out[0], out[1], precision);
      const full = formatEarthAcc(crs, out[0], out[1], lat, precision, "full");
      const condensed = formatEarthAcc(crs, out[0], out[1], lat, precision, "condensed");
      const lowerLeft = label?.lowerLeft ?? [0, 0];
      const half = precision / 2;
      unprojectEarthToLatLon(lowerLeft[0] + half, lowerLeft[1] + half, crs, out);
      if (crs > 1 && getEarthLatitudeBandLetter(out[0]) !== getEarthLatitudeBandLetter(lat)) {
        continue;
      }
      expect(label?.acc).toBe(full?.replace(/ /g, ""));
      if (precision !== 25000) expect(label?.text).toBe(condensed);
      compared++;
    }
    expect(compared).toBeGreaterThan(3500);
  });
});
