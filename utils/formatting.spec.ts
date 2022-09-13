import { describe, it, expect } from '@jest/globals';
import { padZeros } from "./formatting";

describe("padZeros", () => {
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
});
