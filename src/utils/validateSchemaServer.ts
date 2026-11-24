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

const missionSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "mission.json"), "utf8"));
export const currentMissionValidator = ajv.compile<Mission>(missionSchema);

// History compaction validates documents before the planet migration has run.
const legacyMissionSchema = structuredClone(missionSchema);
delete legacyMissionSchema.properties.planet;
legacyMissionSchema.properties.gridSystem = { enum: ["moon-m2025", "earth-wgs84"] };
legacyMissionSchema.properties.planetRadius = { type: ["number", "null"] };
legacyMissionSchema.properties.usingLGRSCoordinates = { type: "boolean" };
legacyMissionSchema.properties.gridRenderMode = { enum: ["server-file", "dynamic-lgrs"] };
legacyMissionSchema.required = legacyMissionSchema.required
  .filter((field: string) => field !== "planet")
  .concat(["planetRadius", "usingLGRSCoordinates", "gridRenderMode"]);
export const missionValidator = ajv.compile({
  definitions: missionSchema.definitions,
  anyOf: [missionSchema, legacyMissionSchema],
});

// Maegistro V2 for sendMDAU
const mdauSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "mdau.json"), "utf8"));
export const mdauSchemaValidator = ajv.compile<MDAU.MaestroDataAegisUses>(mdauSchema);

const missionFieldsSchema = JSON.parse(
  fs.readFileSync(path.join(SCHEMA_DIR, "missionFields.json"), "utf8")
);
export const missionFieldsValidator = ajv.compile<MissionFieldsUpdate>(missionFieldsSchema);
