import { getRexStatusDisplayProperties } from "utils/component-helpers";
import {
  faCircle,
  faCircleCheck,
  faCirclePlay,
  faCircleXmark,
} from "@fortawesome/free-regular-svg-icons";

describe("getRexStatusDisplayProperties()", () => {
  test("no rex status", () => {
    const response = getRexStatusDisplayProperties(null);
    expect(response.icon).toBe(faCirclePlay);
    expect(response.tooltip).toEqual("Status pending");
  });
  test("rex status pending", () => {
    const response = getRexStatusDisplayProperties("pending");
    expect(response.icon).toBe(faCirclePlay);
    expect(response.tooltip).toEqual("Status pending");
  });
  test("rex status in-progress", () => {
    const response = getRexStatusDisplayProperties("in-progress");
    expect(response.icon).toBe(faCircle);
    expect(response.tooltip).toEqual("Status in progress");
  });
  test("rex status complete", () => {
    const response = getRexStatusDisplayProperties("complete");
    expect(response.icon).toBe(faCircleCheck);
    expect(response.tooltip).toEqual("Status complete");
  });
  test("rex status skipped", () => {
    const response = getRexStatusDisplayProperties("skipped");
    expect(response.icon).toBe(faCircleXmark);
    expect(response.tooltip).toEqual("Status skipped");
  });
});
