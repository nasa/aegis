import { fileGridStride } from "utils/mapping/gridSpacing";

describe("file grid spacing", () => {
  test("chooses whole lattice strides at standard distances", () => {
    expect(fileGridStride(10, 30)).toBe(10);
    expect(fileGridStride(9.98, 10)).toBe(1);
    expect(fileGridStride(25, 80)).toBe(4);
    expect(fileGridStride(10, 250, 10)).toBe(100);
  });
});
