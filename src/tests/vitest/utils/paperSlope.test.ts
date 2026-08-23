import { getSlopeClass, SLOPE_CLASSES } from "../../../utils/paperSlope";

vi.mock("paper", () => ({ default: {} }));

describe("slope presentation classes", () => {
  it.each([
    [2, "0–2°"],
    [2.001, ">2–4°"],
    [4, ">2–4°"],
    [6, ">4–6°"],
    [8, ">6–8°"],
    [10, ">8–10°"],
    [12, ">10–12°"],
    [14, ">12–14°"],
    [16, ">14–16°"],
    [18, ">16–18°"],
    [20, ">18–20°"],
    [20.001, ">20°"],
  ])("classifies %s at the explicit boundary", (value, label) => {
    expect(getSlopeClass(value)?.label).toBe(label);
  });

  it("uses magnitude for signed path-grade styling", () => {
    expect(getSlopeClass(-12)).toEqual(getSlopeClass(12));
  });

  it("keeps renderer classes backed by one color palette", () => {
    expect(SLOPE_CLASSES).toHaveLength(11);
    expect(SLOPE_CLASSES.at(-1)).toEqual({
      minExclusive: 20,
      maxInclusive: Infinity,
      label: ">20°",
      color: "#301f42",
    });
  });
});
