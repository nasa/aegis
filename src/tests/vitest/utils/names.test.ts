import { makeUniqueStringCopy } from "utils/names/duplicate";

describe("makeUniqueStringCopy", () => {
  it("should return a name with (copy 1)", () => {
    const str = "test";
    const strCopy = makeUniqueStringCopy(str, ["aaa", "bbb", "ccc", str]);
    expect(strCopy).not.toBe(str);
    expect(strCopy).toBe(`${str} (copy 1)`);
  });
  it("should return a name with (copy 2)", () => {
    const str = "test";
    const strCopy = makeUniqueStringCopy(str, ["aaa", "bbb", "ccc", str, `${str} (copy 1)`]);
    expect(strCopy).not.toBe(str);
    expect(strCopy).toBe(`${str} (copy 2)`);
  });
  it("should return a name with no (copy 1) appended", () => {
    const str = "test";
    const strCopy = makeUniqueStringCopy(str, ["aaa", "bbb", "ccc"]);
    expect(strCopy).toBe(str);
  });
});
