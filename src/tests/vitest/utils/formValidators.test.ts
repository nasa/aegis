import {
  filterHHMMSS,
  filterIntegersOnly,
  filterISOString,
  filterNumbersOnly,
} from "components/interface/form/formValidators";

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
