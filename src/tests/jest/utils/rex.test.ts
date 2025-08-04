import { getRexStatusDisplayProperties } from "utils/component-helpers";
import { faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";

describe("getRexStatusDisplayProperties()", () => {
  test("no rex status", () => {
    const response = getRexStatusDisplayProperties(null);
    expect(response.icon).toBe(faSquare);
    expect(response.tooltip).toEqual("Pending");
  });
  test("rex status pending", () => {
    const response = getRexStatusDisplayProperties("pending");
    expect(response.icon).toBe(faSquare);
    expect(response.tooltip).toEqual("Pending");
  });
  test("rex status in-progress", () => {
    const response = getRexStatusDisplayProperties("in-progress");
    expect(response.icon).toBe(faSquare);
    expect(response.tooltip).toEqual("In Progress");
  });
  test("rex status complete", () => {
    const response = getRexStatusDisplayProperties("complete");
    expect(response.icon).toBe(faSquareCheck);
    expect(response.tooltip).toEqual("Complete");
  });
  test("rex status skipped", () => {
    const response = getRexStatusDisplayProperties("skipped");
    expect(response.icon).toBe(null);
    expect(response.tooltip).toEqual("Skipped");
  });
});
