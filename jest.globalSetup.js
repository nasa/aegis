import { loadEnvConfig } from "@next/env";

const globalSetup = async (_globalSetup) => {
  console.log(""); // clears the line in the terminal before nextjs prints out messages about which .env files were loaded
  const projectDir = process.cwd();
  loadEnvConfig(projectDir);
};

export default globalSetup;
