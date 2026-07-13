import path from "node:path";
import Ajv from "ajv";
import fs from "fs";

// location of all the schemas
export const SCHEMA_DIR = path.join(process.cwd(), ".local/schemas");

// initialize a single ajv instance for the server to use
const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

// Compile the schemas. Want to do this once because it's expensive.
// You can validate it against it multiple times after that by calling the function
// Add schemas below that you want to compile and then validate on
const rexOverwriteSchema = JSON.parse(
  fs.readFileSync(path.join(SCHEMA_DIR, "rexOverwrite.json"), "utf8")
);
export const rexOverwriteSchemaValidator = ajv.compile<RexOverwrite>(rexOverwriteSchema);

const missionSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "mission.json"), "utf8"));
export const missionValidator = ajv.compile<Mission>(missionSchema);
