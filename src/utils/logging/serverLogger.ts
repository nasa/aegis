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

// @emss/logger falls back to console output when logEnableAppLogging is false.
// Playwright CI also calls this logger directly for logins and client logs, so
// disable its transport entirely while retaining ConsoleLogger's diagnostics.
const noop = async (): Promise<void> => {};
export const rawServerLogger: ReturnType<typeof createServerLogger> =
  process.env.AEGIS_TEST_DISABLE_REMOTE_LOGGING === "true"
    ? {
        emergency: noop,
        alert: noop,
        critical: noop,
        error: noop,
        warning: noop,
        notice: noop,
        info: noop,
        debug: noop,
        forwardFromClient: noop,
        logUserLogin: noop,
      }
    : createServerLogger({
        logEnableAppLogging: env.LOG_ENABLE_APP_LOGGING === "true",
        logServerHttpEndpoint: env.LOG_SERVER_HTTP_ENDPOINT,
        logDataAppId: env.LOG_DATA_APP_ID,
        logDataServerName: env.LOG_DATA_SERVER_NAME,
      });

ConsoleLogger.setRemoteLogger(rawServerLogger);

export { ConsoleLogger as serverLogger };
