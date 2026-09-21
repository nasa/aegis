import {
  appSecondsFromDateString,
  formatNumberWithCommas,
  getJulianDate,
  secondsFromhhmmss,
  hhmmFromMinutes,
  hmmFromMinutes,
  hhmmssFromDateString,
  hhmmssFromSeconds,
  hhmmssmmmFromSeconds,
  isoStringFromAnyDateString,
  padZeros,
  shortDateFromDateString,
  titleCase,
  toDecimal,
  roundUpSecondsFromISOString,
  abbreviateString,
  isNotNumber,
  getPercentOrDefault,
  getISOStringFromDateAndTime,
} from "utils/formatting";

describe("Utilities Functions", () => {
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

  test("Formatting: Calculates Seconds into day", () => {
    const julianDateTest = new Date("2020-01-01T00:00:00Z");

    expect(appSecondsFromDateString("2021-01-01T00:00:00.000Z")).toBe(0);
    expect(hhmmssFromDateString("2021-01-01T00:00:00.000Z")).toBe("00:00:00");
    expect(hhmmssmmmFromSeconds(0)).toBe("00:00:00.000");
    expect(hhmmssmmmFromSeconds(-5)).toBe("-00:00:05.000");
    expect(hhmmssFromDateString("")).toBe("");
    expect(hhmmssFromSeconds(0)).toBe("+00:00:00");
    expect(hhmmssFromSeconds(-5)).toBe("-00:00:05");
    expect(shortDateFromDateString("2021-01-01T00:00:00.000Z")).toBe("2021-01-01");
    expect(shortDateFromDateString("")).toBe("");
    expect(isoStringFromAnyDateString("2021-01-01T00:00:00.000Z")).toBe("2021-01-01T00:00:00.000Z");
    expect(() => isoStringFromAnyDateString("XX")).toThrow(
      "The date string couldn't be converted into a Date"
    );

    expect(getJulianDate(julianDateTest)).toBe("2020/1");

    expect(toDecimal("0")).toBe(0);
    expect(toDecimal("0.0")).toBe(0);
    expect(toDecimal("0.00")).toBe(0);
    expect(toDecimal("5..5")).toBe(5.5);
    expect(toDecimal("5.5")).toBe(5.5);
    expect(toDecimal("5.5k")).toBe(5.5);
    expect(toDecimal("sdfsdf")).toBe(null);
    expect(toDecimal(null)).toBe(null);
    expect(toDecimal("")).toBe(null);
  });
});

describe("hhmmFromMinutes", () => {
  it("should format positive minutes into hh:mm", () => {
    expect(hhmmFromMinutes(90)).toEqual("01:30");
    expect(hhmmFromMinutes(120)).toEqual("02:00");
    expect(hhmmFromMinutes(720)).toEqual("12:00");
  });

  it("should format negative minutes into -hh:mm", () => {
    expect(hhmmFromMinutes(-90)).toEqual("-01:30");
    expect(hhmmFromMinutes(-120)).toEqual("-02:00");
    expect(hhmmFromMinutes(-720)).toEqual("-12:00");
  });

  it("should format zero minutes into 00:00", () => {
    expect(hhmmFromMinutes(0)).toEqual("00:00");
  });

  it("should pad single digit hours and minutes with zeros", () => {
    expect(hhmmFromMinutes(9)).toEqual("00:09");
    expect(hhmmFromMinutes(63)).toEqual("01:03");
    expect(hhmmFromMinutes(600)).toEqual("10:00");
  });

  it("should round minutes", () => {
    expect(hhmmFromMinutes(9.7)).toEqual("00:10");
    expect(hhmmFromMinutes(63.3)).toEqual("01:04");
    expect(hhmmFromMinutes(600.1)).toEqual("10:01");
  });
});

describe("hmmFromMinutes", () => {
  it("should format positive minutes into hh:mm", () => {
    expect(hmmFromMinutes(90)).toEqual("1:30");
    expect(hmmFromMinutes(120)).toEqual("2:00");
    expect(hmmFromMinutes(720)).toEqual("12:00");
  });

  it("should format negative minutes into -hh:mm", () => {
    expect(hmmFromMinutes(-90)).toEqual("-1:30");
    expect(hmmFromMinutes(-120)).toEqual("-2:00");
    expect(hmmFromMinutes(-720)).toEqual("-12:00");
  });

  it("should format zero minutes into 00:00", () => {
    expect(hmmFromMinutes(0)).toEqual("0:00");
  });

  it("should pad single digit hours and minutes with zeros", () => {
    expect(hmmFromMinutes(9)).toEqual("0:09");
    expect(hmmFromMinutes(63)).toEqual("1:03");
    expect(hmmFromMinutes(600)).toEqual("10:00");
  });

  it("should round minutes", () => {
    expect(hmmFromMinutes(9.7)).toEqual("0:10");
    expect(hmmFromMinutes(63.3)).toEqual("1:04");
    expect(hmmFromMinutes(600.1)).toEqual("10:01");
  });
});

describe("formatNumberWithCommas", () => {
  it("formats numbers with commas", () => {
    expect(formatNumberWithCommas(1000)).toBe("1,000");
    expect(formatNumberWithCommas(123456789.12)).toBe("123,456,789");
    expect(formatNumberWithCommas(9876543210.123)).toBe("9,876,543,210");
  });

  it('returns "0.00" when given 0', () => {
    expect(formatNumberWithCommas(0)).toBe("0");
  });
});

describe("getPercentOrDefault", () => {
  it("should return a percentage", () => {
    expect(getPercentOrDefault(0.2)).toBe(20);
    expect(getPercentOrDefault(0)).toBe(0);
    expect(getPercentOrDefault(1)).toBe(100);
  });

  it("should return 100 when given undefined", () => {
    expect(getPercentOrDefault(undefined)).toBe(100);
  });
});

describe("titleCase", () => {
  it("should return an empty string when given an empty string", () => {
    expect(titleCase("")).toBe("");
  });

  it("should capitalize the first letter of each word in a string", () => {
    expect(titleCase("hello world")).toBe("Hello World");
    expect(titleCase("the quick brown fox")).toBe("The Quick Brown Fox");
  });

  it("should handle strings with leading/trailing whitespace", () => {
    expect(titleCase("  hello world  ")).toBe("  Hello World  ");
  });

  it("should handle strings with non-letter characters", () => {
    expect(titleCase("123 hello world!")).toBe("123 Hello World!");
    expect(titleCase("the_quick_brown_fox")).toBe("The_quick_brown_fox");
  });
});

describe("getSecondsFromhhmmss", () => {
  // Test for valid input
  it("should return the correct number of seconds for a valid hh:mm:ss string", () => {
    expect(secondsFromhhmmss("+01:30:15")).toBe(5415);
    expect(secondsFromhhmmss("+00:00:00")).toBe(0);
    expect(secondsFromhhmmss("+00:01:01")).toBe(61);
  });

  // Test for invalid input
  it("should return NaN for invalid input", () => {
    expect(secondsFromhhmmss("invalid")).toBeNaN();
    expect(secondsFromhhmmss("01:30")).toBeNaN();
  });

  // Test for edge cases
  it("should handle edge cases", () => {
    expect(secondsFromhhmmss("+00:00:60")).toBe(60);
    expect(secondsFromhhmmss("+00:60:00")).toBe(3600);
    expect(secondsFromhhmmss("+24:00:00")).toBe(86400);
  });

  // Test for negative times
  it("should handle negative times", () => {
    expect(secondsFromhhmmss("-01:30:15")).toBe(-5415);
    expect(secondsFromhhmmss("-00:00:00")).toBe(0);
    expect(secondsFromhhmmss("-00:01:01")).toBe(-61);
  });
});

describe("roundUpSecondsFromISOString", () => {
  it("should round up seconds from ms", () => {
    expect(roundUpSecondsFromISOString("2021-01-01T00:00:00.001Z")).toBe(
      "2021-01-01T00:00:01.000Z"
    );
    expect(roundUpSecondsFromISOString("2021-01-01T00:00:30.182Z")).toBe(
      "2021-01-01T00:00:31.000Z"
    );
    expect(roundUpSecondsFromISOString("2021-01-01T00:00:30.500Z")).toBe(
      "2021-01-01T00:00:31.000Z"
    );
    expect(roundUpSecondsFromISOString("2021-01-01T00:00:30.999Z")).toBe(
      "2021-01-01T00:00:31.000Z"
    );
  });

  it("should stay at 0 seconds for 0 ms", () => {
    expect(roundUpSecondsFromISOString("2021-01-01T00:00:00.000Z")).toBe(
      "2021-01-01T00:00:00.000Z"
    );
  });

  it("should rollover for other time units", () => {
    expect(roundUpSecondsFromISOString("2021-01-01T00:30:59.001Z")).toBe(
      "2021-01-01T00:31:00.000Z"
    );
    expect(roundUpSecondsFromISOString("2021-01-01T08:59:59.001Z")).toBe(
      "2021-01-01T09:00:00.000Z"
    );
    expect(roundUpSecondsFromISOString("2021-01-01T23:59:59.001Z")).toBe(
      "2021-01-02T00:00:00.000Z"
    );
  });
});

describe("abbreviateString", () => {
  it("should abbreviate a string to a certain length and add ellipsis if needed", () => {
    expect(abbreviateString("Lorem ipsum test for string", 10)).toBe("Lorem i...");
    expect(abbreviateString("Lorem ipsum test for string", 1)).toBe("...");
  });

  it("should not abbreviate a string if below or equal to the maximum length", () => {
    expect(abbreviateString("Lorem ipsum", 20)).toBe("Lorem ipsum");
    expect(abbreviateString("Lorem ipsum", 11)).toBe("Lorem ipsum");
  });
});

describe("isNotNumber", () => {
  it("should return true if not a number", () => {
    expect(isNotNumber("not-number")).toBe(true);
    expect(isNotNumber("324")).toBe(true);
    expect(isNotNumber(null)).toBe(true);
    expect(isNotNumber(undefined)).toBe(true);
  });

  it("should return false if is a number", () => {
    expect(isNotNumber(293)).toBe(false);
    expect(isNotNumber(293.22)).toBe(false);
  });
});

describe("getISOStringFromDateAndTime", () => {
  it("should return an ISO string when given date and time", () => {
    expect(getISOStringFromDateAndTime("2026-09-21", "11:46:00.000")).toBe(
      "2026-09-21T11:46:00.000Z"
    );
    expect(getISOStringFromDateAndTime("2026-09-21", "3:48:00.000")).toBe(
      "2026-09-21T03:48:00.000Z"
    );
    expect(getISOStringFromDateAndTime("2026-09-21", "12:20:05")).toBe("2026-09-21T12:20:05Z");
  });
});
