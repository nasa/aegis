import { describe, expect, test, it } from "@jest/globals";
import { getDistanceBetweenTwoCoordinates } from "utils/geoMath";
import { LatLng } from "leaflet";
import {
  appSecondsFromDateString,
  cleanCollectionsString,
  formatEVADisplayTitle,
  getJulianDate,
  getPlayheadISOString,
  hhmmssFromDateString,
  hhmmssFromSeconds,
  hhmmssmmmFromSeconds,
  isoStringFromAnyDateString,
  padZeros,
  shortdateFromDateString,
} from "../utils/formatting";
import Mikro from "../utils/mikro";

describe("Utilities Functions", () => {
  const latLng1: LatLng = new LatLng(0, 0);
  const latLng2: LatLng = new LatLng(0, 0);
  const tests = [
    {
      num: 7,
      size: 2,
      expected: "07",
    },
    {
      num: 23,
      size: 2,
      expected: "23",
    },
    {
      num: 222,
      size: 2,
      expected: "222",
    },
    {
      num: 0,
      size: 5,
      expected: "00000",
    },
    {
      num: 0,
      size: 0,
      expected: "0",
    },
    {
      num: 5,
      size: -3,
      expected: "5",
    },
  ];
  for (const test of tests) {
    it(`should result in "${test.expected}" when ${test.num} padded with ${test.size} zeros`, () => {
      expect(padZeros(test.num, test.size)).toEqual(test.expected);
    });
  }
  test("GeoMath: Returns 0 distance between two identical coordinates", () => {
    expect(getDistanceBetweenTwoCoordinates(latLng1, latLng2, 0)).toBe(0);
  });

  test("Formatting: Calculates Seconds into day", () => {
    const julianDateTest = new Date("2020-01-01T00:00:00Z");
    const displayTitle1 = {
      pageName: "US EVA 1",
      descriptiveTitle: "US EVA 1",
    };
    const displayTitle2 = {
      pageName: "US EVA 55",
      descriptiveTitle: "The second",
    };

    const displayTitle3 = {
      pageName: "XX",
      descriptiveTitle: "US EVA 55 : The 3rd",
    };

    const displayTitle4 = {
      pageName: "US EVA",
      descriptiveTitle: "XXX",
    };
    const displayTitle5 = {
      pageName: "US EVA 55",
      descriptiveTitle: "(XXX)",
    };

    expect(appSecondsFromDateString("2021-01-01T00:00:00.000Z")).toBe(0);
    expect(hhmmssFromDateString("2021-01-01T00:00:00.000Z")).toBe("00:00:00");
    expect(hhmmssmmmFromSeconds(0)).toBe("00:00:00.000");
    expect(hhmmssmmmFromSeconds(-5)).toBe("-00:00:05.000");
    expect(hhmmssFromDateString("")).toBe("");
    expect(hhmmssFromSeconds(0)).toBe("00:00:00");
    expect(hhmmssFromSeconds(-5)).toBe("-00:00:05");
    expect(shortdateFromDateString("2021-01-01T00:00:00.000Z")).toBe("2021-01-01");
    expect(shortdateFromDateString("")).toBe("");
    expect(isoStringFromAnyDateString("2021-01-01T00:00:00.000Z")).toBe("2021-01-01T00:00:00.000Z");
    expect(() => isoStringFromAnyDateString("XX")).toThrow(
      "The date string couldn't be converted into a Date"
    );
    expect(getPlayheadISOString("2021-01-01T00:00:00.000Z", 0)).toBe("2021-01-01T00:00:00.000Z");
    expect(cleanCollectionsString("Space Force|Will be deleted|Earth Obs")).toBe(
      "Earth Obs Earth Obs"
    );
    expect(cleanCollectionsString("Test|Cleaned|Photo")).toBe("Photo");
    expect(cleanCollectionsString("Cobalt Corax")).toBe("Cobalt Corax");
    expect(getJulianDate(julianDateTest)).toBe("2020/1");
    expect(formatEVADisplayTitle(displayTitle1)).toBe("US EVA 1");
    expect(formatEVADisplayTitle(displayTitle2)).toBe("US EVA 55 - The second");
    expect(formatEVADisplayTitle(displayTitle3)).toBe("US EVA 55 : The 3rd");
    expect(formatEVADisplayTitle(displayTitle4)).toBe("US EVA");
    expect(formatEVADisplayTitle(displayTitle5)).toBe("US EVA 55 - XXX");
  });
  describe("Mikro ORM", () => {
    test("Entity Manager Error", async () => {
      expect(() => Mikro.getEM()).toThrow("Entity Manager not initialized");
    });
  });
});
