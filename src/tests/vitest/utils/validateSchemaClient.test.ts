import fs from "node:fs";
import path from "node:path";
import type { Mock } from "vitest";
import {
  validateGeoJSON,
  validateImportableSublayer,
  validateMission,
} from "utils/validateSchemaClient";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankSublayer } from "store/storeUtils/sublayer";

global.fetch = vi.fn();

const testDir = path.resolve(__dirname, "..");
const schemaDir = path.resolve(__dirname, "../../../../.local/schemas");

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

describe("validateImportableSublayer", () => {
  // Mock the fetch that the validate fn does to get the schema, but still use the actual schema
  // This is to make the test faster so we don't have to init supertest and mikro
  const sublayerSchema = JSON.parse(
    fs.readFileSync(path.join(schemaDir, "sublayerImportable.json"), "utf8")
  );
  const makeMockSuccessResponse = () =>
    ({
      status: 200,
      json: () => Promise.resolve({ data: sublayerSchema }),
    }) as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("Throws an error if the schema endpoint returns a non-200 status", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({ status: 500 } as Response);
    await expect(validateImportableSublayer({})).rejects.toThrow(
      "Error retrieving sublayer schema: 500"
    );
  });

  test("Returns errors for a full Sublayer object", async () => {
    (global.fetch as Mock).mockResolvedValueOnce(makeMockSuccessResponse());
    const errors = await validateImportableSublayer(generateBlankSublayer());
    expect(errors.length).toBeGreaterThan(0);
  });

  test("Returns no errors for a valid SublayerImportable object", async () => {
    // Only the importable subset of fields is allowed
    (global.fetch as Mock).mockResolvedValueOnce(makeMockSuccessResponse());
    const validImportable: SublayerImportable = { name: "Vitest My Sublayer", type: "tile" };
    const errors = await validateImportableSublayer(validImportable);
    expect(errors.length).toBe(0);
  });
});

describe("validateMission", () => {
  // Mock the fetch that the validate fn does to get the schema, but still use the actual schema
  // This is to make the test faster so we don't have to init supertest and mikro
  const missionSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, "mission.json"), "utf8"));
  const makeMockSuccessResponse = () =>
    ({
      status: 200,
      json: () => Promise.resolve({ data: missionSchema }),
    }) as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("Throws an error if the schema endpoint returns a non-200 status", async () => {
    (global.fetch as Mock).mockResolvedValueOnce({ status: 500 } as Response);
    await expect(validateMission({})).rejects.toThrow("Error retrieving mission schema: 500");
  });

  test("Returns errors for an object that fails schema validation", async () => {
    (global.fetch as Mock).mockResolvedValueOnce(makeMockSuccessResponse());
    const errors = await validateMission({ name: 42 });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("Returns no errors for a blank mission", async () => {
    (global.fetch as Mock).mockResolvedValueOnce(makeMockSuccessResponse());
    const errors = await validateMission(generateBlankMission());
    expect(errors.length).toBe(0);
  });
});
