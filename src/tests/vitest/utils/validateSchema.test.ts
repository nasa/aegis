import fs from "node:fs";
import path from "node:path";
import { validateGeoJSON } from "utils/validateSchemaClient";

const testDir = `${process.cwd()}/src/tests/vitest`;

describe("GeoJSON validation", () => {
  const goodGeoJSONFile = path.join(testDir, "fixtures", "static", "good.geojson");
  const badGeoJSONFile = path.join(testDir, "fixtures", "static", "bad.geojson");

  const stringifiedGoodGeoJSON = fs.readFileSync(goodGeoJSONFile).toString();
  const stringifiedBadGeoJSON = fs.readFileSync(badGeoJSONFile).toString();

  test("Returns invalid if a file cannot even be parsed as JSON", () => {
    const plainText = "plain text";

    const [valid, errs] = validateGeoJSON(plainText);
    expect(valid).toBe(false);
    expect(errs.length).toBe(1);
    expect(errs[0]).toBeInstanceOf(SyntaxError);
  });

  test("Returns invalid if a JSON file is almost valid geojson", () => {
    const [valid, errs] = validateGeoJSON(stringifiedBadGeoJSON);
    expect(valid).toBe(false);
    expect(errs.length).toBeGreaterThan(0);
  });

  test("Returns valid for simple GeoJSON", () => {
    const simpleGeoJSONString = '{"type": "Point", "coordinates": [-95.098343, 29.551881]}';

    const [valid, errs] = validateGeoJSON(simpleGeoJSONString);
    expect(valid).toBe(true);
    expect(errs.length).toBe(0);
  });

  test("Returns valid for known good GeoJSON", () => {
    const [valid, errs] = validateGeoJSON(stringifiedGoodGeoJSON);
    expect(valid).toBe(true);
    expect(errs.length).toBe(0);
  });
});
