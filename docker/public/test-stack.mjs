import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { composeArgs } from "./compose.mjs";
import { projectRoot, setupPublic } from "./setup.mjs";

export function isolatedArgs(root, project, args) {
  if (!/^aegis-public-check-\d+-[a-f0-9]{8}$/.test(project))
    throw new Error("Refusing to manage a non-test project");
  return composeArgs(root, [
    "-f",
    path.join(root, "docker/public/test-compose.yml"),
    "--project-name",
    project,
    ...args,
  ]);
}

export function isolatedEnvironment(config, port) {
  return {
    ...config,
    PUBLIC_ORIGIN: `https://localhost:${port}`,
    PUBLIC_HOST: "localhost",
    PUBLIC_PORT: String(port),
    PUBLIC_BIND: "127.0.0.1",
    PUBLIC_DEMO_SEED: "true",
    STATIC_DIR: "public-test-static",
  };
}

export function validateTestMounts(config, project) {
  for (const volume of Object.values(config.volumes || {})) {
    if (volume.external || !volume.name?.startsWith(`${project}_`))
      throw new Error("Test volumes must belong exclusively to the disposable project");
  }
  for (const service of Object.values(config.services)) {
    for (const mount of service.volumes || []) {
      if (mount.type !== "volume" || !config.volumes?.[mount.source])
        throw new Error("Browser tests must not mount host files or directories");
    }
  }
}

function command(executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: projectRoot, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function main() {
  const config = setupPublic();
  const build = await command("docker", composeArgs(projectRoot, ["build"]), process.env);
  if (build !== 0) return build;
  const project = `aegis-public-check-${process.pid}-${randomBytes(4).toString("hex")}`;
  const env = { ...process.env, ...isolatedEnvironment(config, await availablePort()) };
  console.log(
    `Running browser checks in disposable project ${project}; static files use a private named volume.`
  );
  const rendered = JSON.parse(
    execFileSync("docker", isolatedArgs(projectRoot, project, ["config", "--format", "json"]), {
      cwd: projectRoot,
      env,
      encoding: "utf8",
      windowsHide: true,
    })
  );
  validateTestMounts(rendered, project);
  console.log("Verified test mounts: private named volumes only; no host files or shared volumes.");
  try {
    const started = await command(
      "docker",
      isolatedArgs(projectRoot, project, ["up", "-d", "--no-build", "--wait"]),
      env
    );
    if (started !== 0) return started;
    return await command(
      process.execPath,
      [path.join(projectRoot, "docker/public/test-auth.mjs")],
      {
        ...env,
        PUBLIC_AUTH_TEST_PROJECT: project,
        PUBLIC_TEST_ORIGIN: env.PUBLIC_ORIGIN,
      }
    );
  } finally {
    const cleanup = await command(
      "docker",
      isolatedArgs(projectRoot, project, ["down", "--volumes", "--remove-orphans"]),
      env
    );
    if (cleanup !== 0) throw new Error(`Could not remove disposable test project ${project}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
