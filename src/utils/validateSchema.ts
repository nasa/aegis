import Ajv, { ErrorObject } from "ajv";

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
    throw new Error(`Error retrieving schema: ${schemaRes.status}`);
  }
  const schema = (await schemaRes.json()).data;
  const validate = ajv.compile(schema);
  const valid = validate(sublayerToValidate);
  if (!valid) {
    return validate.errors || [];
  }
  return [];
};
