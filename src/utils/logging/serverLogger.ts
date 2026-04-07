import "utils/loadEnv";
import { createServerLogger } from "@emss/logger";
import { assertEnvVarsExist } from "@emss/utils";
import ConsoleLogger from "./consoleLogger";

/**
 * **Do not use in browser.**
 */

const env = assertEnvVarsExist(
  "LOG_ENABLE_APP_LOGGING",
  "LOG_SERVER_HTTP_ENDPOINT",
  "LOG_DATA_APP_ID",
  "LOG_DATA_SERVER_NAME"
);

ConsoleLogger.setConsoleLogLevel((process.env.VITE_PUBLIC_CONSOLE_LOG_LEVEL as LogLevel) || "off");
ConsoleLogger.setRemoteLogLevel((process.env.VITE_PUBLIC_REMOTE_LOG_LEVEL as LogLevel) || "off");

export const rawServerLogger = createServerLogger({
  logEnableAppLogging: env.LOG_ENABLE_APP_LOGGING === "true",
  logServerHttpEndpoint: env.LOG_SERVER_HTTP_ENDPOINT,
  logDataAppId: env.LOG_DATA_APP_ID,
  logDataServerName: env.LOG_DATA_SERVER_NAME,
});

ConsoleLogger.setRemoteLogger(rawServerLogger);

export { ConsoleLogger as serverLogger };
