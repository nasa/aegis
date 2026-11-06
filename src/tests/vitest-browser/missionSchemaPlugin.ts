import type { Plugin } from "vite";
import path from "node:path";

/** Generate the same schema as schema:create:mission without requiring a prior API build. */
export function missionSchemaPlugin(workspaceRoot: string): Plugin {
  const moduleId = "virtual:aegis-mission-schema";
  let schemaModule: string | undefined;
  return {
    name: "aegis-test-mission-schema",
    resolveId(id) {
      if (id === moduleId) return `\0${moduleId}`;
    },
    async load(id) {
      if (id !== `\0${moduleId}`) return;
      if (!schemaModule) {
        const { generateSchema, programFromConfig } = await import("typescript-json-schema");
        const program = programFromConfig(path.resolve(workspaceRoot, "tsconfig.schema.json"));
        const schema = generateSchema(program, "Mission", {
          required: true,
          noExtraProps: true,
          ignoreErrors: true,
        });
        if (!schema) throw new Error("Could not generate the mission test schema");
        schemaModule = `export default ${JSON.stringify(schema)}`;
      }
      return schemaModule;
    },
  };
}
