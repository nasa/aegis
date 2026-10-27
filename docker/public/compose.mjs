import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot, setupPublic } from "./setup.mjs";

export function composeArgs(root, args) {
  return [
    "compose",
    "--project-directory",
    root,
    "--env-file",
    path.join(root, ".env.public"),
    "-f",
    path.join(root, "docker-compose.public.yml"),
    ...args,
  ];
}

async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", composeArgs(projectRoot, args), {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function main(args) {
  if (!args.length)
    throw new Error("Provide a Compose command, for example: npm run docker:public:status");
  const config = setupPublic();
  if (args[0] === "migrate") {
    for (const script of ["migration:up", "automerge:migration:run"]) {
      const code = await run(["exec", "-T", "apiv1", "npm", "run", script]);
      if (code !== 0) return code;
    }
    return 0;
  }
  const code = await run(args);
  if (code === 0 && args[0] === "up")
    console.log(`Open ${config.PUBLIC_ORIGIN} and choose a demo identity.`);
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(
      error.code === "ENOENT"
        ? "Docker is required. Install and start Docker Desktop, then retry."
        : error.message
    );
    process.exitCode = 1;
  }
}
