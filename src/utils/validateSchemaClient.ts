import type { DefinedError, ErrorObject } from "ajv";
import Ajv from "ajv";
import geojsonSchema from "./geojson-schema.json";

// instantiate with options
const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

/**
 * validate a sublayer object against the schema generated from the sublayer type
 * @param sublayerToValidate the sublayer object
 * @returns an array of validation errors, or empty array if no errors
 */
export const validateImportableSublayer = async (
  sublayerToValidate: unknown
): Promise<ErrorObject[]> => {
  const schemaRes = await fetch(`/api/v1/sublayer/schema`);
  if (schemaRes.status !== 200) {
    throw new Error(`Error retrieving sublayer schema: ${schemaRes.status}`);
  }
  const schema = (await schemaRes.json()).data;
  const validate = ajv.compile(schema);
  const valid = validate(sublayerToValidate);
  if (!valid) {
    return validate.errors || [];
  }
  return [];
};

/** Check if some plain text data is valid GeoJSON according to https://geojson.org/schema/GeoJSON.json. If anything goes wrong while parsing GeoJSON, it returns the errors too
 * @param data string that could possibly be stringified GeoJSON
 * @returns tuple [valid, errors[]]
 */
export function validateGeoJSON(data: string): [boolean, (DefinedError | SyntaxError)[]] {
  let maybeGeojson = {};
  try {
    maybeGeojson = JSON.parse(data);
  } catch (e) {
    const errors = [e as SyntaxError];
    return [false, errors];
  }

  const validate = ajv.compile(geojsonSchema);

  const isValid = validate(maybeGeojson);
  if (isValid) {
    return [true, []];
  }

  return [false, validate.errors as DefinedError[]];
}

/**
 * validate the mission object against the mission schema
 */
export const validateMission = async (
  missionToValidate: unknown,
  loadTestOptions?: {
    // used for load testing ONLY
    serverURL?: string;
    cookies?: string;
  }
): Promise<ErrorObject[]> => {
  const path = loadTestOptions?.serverURL
    ? `${loadTestOptions?.serverURL}/api/v1/mission/schema`
    : `/api/v1/mission/schema`;

  const headers: HeadersInit = {};
  if (loadTestOptions?.cookies) {
    headers["Cookie"] = loadTestOptions?.cookies;
  }

  const schemaRes = await fetch(`${path}`, { headers });
  if (schemaRes.status !== 200) {
    throw new Error(`Error retrieving mission schema: ${schemaRes.status}`);
  }
  const schema = (await schemaRes.json()).data;
  const validate = ajv.compile(schema);
  const valid = validate(missionToValidate);
  if (!valid) {
    return validate.errors || [];
  }
  return [];
};
