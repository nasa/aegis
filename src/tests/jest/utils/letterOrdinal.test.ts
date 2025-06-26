import { letterOrdinal } from "utils/formatting";

describe("letterOrdinal", () => {
  test("should convert single digit numbers to single letters", () => {
    expect(letterOrdinal(1)).toBe("A");
    expect(letterOrdinal(2)).toBe("B");
    expect(letterOrdinal(3)).toBe("C");
    expect(letterOrdinal(26)).toBe("Z");
  });

  test("should convert double digit numbers to double letters", () => {
    expect(letterOrdinal(27)).toBe("AA");
    expect(letterOrdinal(28)).toBe("AB");
    expect(letterOrdinal(52)).toBe("AZ");
    expect(letterOrdinal(53)).toBe("BA");
    expect(letterOrdinal(702)).toBe("ZZ");
  });

  test("should convert triple digit numbers to triple letters", () => {
    expect(letterOrdinal(703)).toBe("AAA");
    expect(letterOrdinal(704)).toBe("AAB");
    expect(letterOrdinal(728)).toBe("AAZ");
    expect(letterOrdinal(729)).toBe("ABA");
  });

  test("should handle edge cases around alphabet boundaries", () => {
    expect(letterOrdinal(25)).toBe("Y");
    expect(letterOrdinal(26)).toBe("Z");
    expect(letterOrdinal(27)).toBe("AA");
    expect(letterOrdinal(51)).toBe("AY");
    expect(letterOrdinal(52)).toBe("AZ");
    expect(letterOrdinal(53)).toBe("BA");
  });

  test("should throw error for invalid inputs", () => {
    expect(() => letterOrdinal(0)).toThrow("Input must be a positive integer");
    expect(() => letterOrdinal(-1)).toThrow("Input must be a positive integer");
    expect(() => letterOrdinal(-10)).toThrow("Input must be a positive integer");
  });

  test("should handle large numbers correctly", () => {
    expect(letterOrdinal(18278)).toBe("ZZZ");
    expect(letterOrdinal(18279)).toBe("AAAA");
  });
});
