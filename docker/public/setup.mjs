import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export function setupPublic(root = projectRoot, log = console.log, environment = process.env) {
  const envPath = path.join(root, ".env.public");
  const template = readFileSync(path.join(root, ".env.public.template"), "utf8");
  if (!existsSync(envPath)) {
    writeFileSync(
      envPath,
      template.replace(
        /^(\w+)=[ \t]*$/gm,
        (_line, key) => `${key}=${randomBytes(32).toString("base64url")}`
      ),
      { flag: "wx", mode: 0o600 }
    );
    log("Created .env.public with random secrets.");
  } else {
    log("Using existing .env.public; secrets and settings preserved.");
  }
  const config = { ...parseEnv(template), ...parseEnv(readFileSync(envPath, "utf8")) };
  for (const key of Object.keys(config)) {
    if (environment[key] !== undefined) config[key] = environment[key];
  }
  for (const key of ["PUBLIC_DB_PASSWORD", "PUBLIC_COOKIE_SECRET", "PUBLIC_EMSS_TOKEN"]) {
    if (!config[key]) throw new Error(`Set ${key} in .env.public before starting the demo`);
  }
  if (config.PUBLIC_COOKIE_SECRET.length < 32)
    throw new Error("PUBLIC_COOKIE_SECRET must contain at least 32 characters");
  const url = new URL(config.PUBLIC_ORIGIN);
  if (url.protocol !== "https:" || url.origin !== config.PUBLIC_ORIGIN)
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash");
  if (config.PUBLIC_HOST !== url.hostname || String(config.PUBLIC_PORT) !== (url.port || "443"))
    throw new Error("PUBLIC_HOST and PUBLIC_PORT must match PUBLIC_ORIGIN in .env.public");
  const staticDir = path.resolve(root, config.STATIC_DIR);
  mkdirSync(path.join(staticDir, "missionFiles"), { recursive: true });
  log(`Demo URL: ${config.PUBLIC_ORIGIN}`);
  log(`GIS assets: ${path.join(staticDir, "missionFiles")}`);
  return config;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    setupPublic();
    console.log("Run npm run dev:public to build and start the demo.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
