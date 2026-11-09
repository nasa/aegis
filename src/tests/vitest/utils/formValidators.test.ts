import {
  filterHHMMSS,
  filterIntegersOnly,
  filterISOString,
  filterNumbersOnly,
  getFiltersForValidators,
  validators,
} from "components/interface/form/formValidators";

describe("HH:MM:SS validation", () => {
  it.each(["", "  ", "00:00:00", "+12:34:56", "-00:00:30", "+100:00:00", " -01:02:03 "])(
    "accepts %j",
    (value) => expect(validators.mustBeHHMMSS(value)).toBeUndefined()
  );

  it.each([
    "00:60:00",
    "+00:00:60",
    "12:34",
    "1:00:00",
    "++12:00:00",
    "current",
    "clear",
    "1e2:00:00",
    "+01:00:00.5",
    "99999999999999999:00:00",
  ])("rejects %j", (value) => expect(validators.mustBeHHMMSS(value)).toBeDefined());
});

describe("Filter functions", () => {
  it("should strip non-numbers", () => {
    expect(filterNumbersOnly("notA1234Number")).toEqual("1234");
    expect(filterNumbersOnly("1234")).toEqual("1234");
    expect(filterNumbersOnly("92;d[oj823d f234")).toEqual("92823234");
    expect(filterNumbersOnly("-0.050")).toEqual("-0.050");
    expect(filterNumbersOnly("100")).toEqual("100");
    expect(filterNumbersOnly("001")).toEqual("001");
  });

  it("should strip non-integers", () => {
    expect(filterIntegersOnly("jhsdjh1234sd")).toEqual("1234");
    expect(filterIntegersOnly(".1234")).toEqual("1234");
    expect(filterIntegersOnly("92;d[oj823d f234")).toEqual("92823234");
    expect(filterIntegersOnly("-0.050")).toEqual("-0050");
    expect(filterIntegersOnly("1.00")).toEqual("100");
    expect(filterIntegersOnly("001")).toEqual("001");
  });

  it("should strip non-time characters", () => {
    expect(filterHHMMSS("20:30:01")).toEqual("20:30:01");
    expect(filterHHMMSS("-20:30:01")).toEqual("-20:30:01");
    expect(filterHHMMSS("20[30]01")).toEqual("203001");
    expect(filterHHMMSS("-0.050")).toEqual("-0050");
    expect(filterHHMMSS("100:")).toEqual("100:");
    expect(filterHHMMSS(":001-")).toEqual(":001-");
  });

  it("should strip non-ISO string characters", () => {
    expect(filterISOString("2026-09-28T14:30:00.123Z")).toEqual("2026-09-28T14:30:00.123Z");
    expect(filterISOString("2026-AB/28T14:30:00.123Z")).toEqual("2026-28T14:30:00.123Z");
  });
});

describe("coordinate range validators", () => {
  it.each(["", "0", "-90", "90", "-89.123456"])("accepts latitude %j", (value) => {
    expect(validators.mustBeLatitude(value)).toBeUndefined();
  });
  it.each(["", "0", "-360", "360", "270.5"])("accepts longitude %j", (value) => {
    expect(validators.mustBeLongitude(value)).toBeUndefined();
  });
  it.each(["-90.001", "90.001", "NaN", "Infinity", "abc"])("rejects latitude %j", (value) => {
    expect(validators.mustBeLatitude(value)).toBe("Latitude must be between -90 and 90");
  });
  it.each(["-360.001", "360.001", "NaN", "Infinity", "abc"])("rejects longitude %j", (value) => {
    expect(validators.mustBeLongitude(value)).toBe("Longitude must be between -360 and 360");
  });
  it("uses numeric character filters in shared fields", () => {
    expect(getFiltersForValidators([validators.mustBeLatitude])("abc-89.5")).toBe("-89.5");
    expect(getFiltersForValidators([validators.mustBeLongitude])("abc270.5")).toBe("270.5");
  });
});
