import path from "path";
import Ajv from "ajv";
import * as rexOverwriteSchema from "../../.local/schemas/rexOverwrite.json";

// location of all the schemas
export const SCHEMA_DIR = path.join(process.cwd(), ".local/schemas");

// initialize a single ajv instance for the server to use
const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

// Compile the schemas. Want to do this once because it's expensive.
// You can validate it against it multiple times after that by calling the function
// Add schemas below that you want to compile and then validate on
export const rexOverwriteSchemaValidator = ajv.compile<RexOverwrite>(rexOverwriteSchema);
