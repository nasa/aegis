import path from "node:path";
import Ajv from "ajv";
import fs from "fs";
import type { MDAU } from "server/maestro/v2/types/mdau";

// location of all the schemas
export const SCHEMA_DIR = path.join(process.cwd(), ".local/schemas");

// initialize a single ajv instance for the server to use
const ajv = new Ajv({ verbose: true, allowUnionTypes: true, allErrors: true });

// Compile the schemas. Want to do this once because it's expensive.
// You can validate it against it multiple times after that by calling the function
// Add schemas below that you want to compile and then validate on

// Maegistro V1 for rexOverwrite
const rexOverwriteSchema = JSON.parse(
  fs.readFileSync(path.join(SCHEMA_DIR, "rexOverwrite.json"), "utf8")
);
export const rexOverwriteSchemaValidator = ajv.compile<RexOverwrite>(rexOverwriteSchema);

const missionSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "mission.json"), "utf8"));
export const missionValidator = ajv.compile<Mission>(missionSchema);

// Maegistro V2 for sendMDAU
const mdauSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "mdau.json"), "utf8"));
export const mdauValidator = ajv.compile<MDAU.MaestroDataAegisUses>(mdauSchema);

const missionFieldsSchema = JSON.parse(
  fs.readFileSync(path.join(SCHEMA_DIR, "missionFields.json"), "utf8")
);
export const missionFieldsValidator = ajv.compile<MissionFieldsUpdate>(missionFieldsSchema);
