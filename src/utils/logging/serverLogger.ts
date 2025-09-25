import { createServerLogger } from "@emss/logger";
import { assertEnvVarsExist } from "@emss/utils";

const env = assertEnvVarsExist(
  "LOG_ENABLE_APP_LOGGING",
  "LOG_SERVER_HTTP_ENDPOINT",
  "LOG_DATA_APP_ID",
  "LOG_DATA_SERVER_NAME"
);

/**
 * **Do not use in browser.**
 *
 * Used for server-side logging only.
 */
const serverLogger = createServerLogger({
  logEnableAppLogging: env.LOG_ENABLE_APP_LOGGING === "true",
  logServerHttpEndpoint: env.LOG_SERVER_HTTP_ENDPOINT,
  logDataAppId: env.LOG_DATA_APP_ID,
  logDataServerName: env.LOG_DATA_SERVER_NAME,
});

/**
 * Wrapper function for keeping logging consistent across API routes.
 */
type LogLevel = "info" | "notice" | "warn" | "error";
export const apiRouteLogger = <T extends LogLevel>({
  logLevel,
  httpMethod,
  responseStatus,
  routeName,
  appUsername,
  message,
  missionId,
  uuids,
  error,
}: {
  logLevel: T;
  httpMethod: "GET" | "POST" | "DELETE";
  responseStatus: number;
  routeName: string;
  appUsername?: string; // if applicable. Ex: does not apply on token only api endpoints like /emss
  missionId?: number; // if applicable
  uuids?: string[]; // if applicable, may also be a refUuid or a numeric id field
  message?: string;
  // This type script conditional ensures that if logLevel is "error", then error must be provided, otherwise it must not be provided.
} & (T extends "error" ? { error: Error } : { error?: never })): void => {
  const logId = "API Route";
  const logValue = `${httpMethod} ${responseStatus} ${routeName}${message ? ` ${message}` : ""}`;
  if (logLevel === "info") {
    serverLogger.info({ logId, logValue, appUsername, missionId, uuids });
  } else if (logLevel === "notice") {
    serverLogger.notice({ logId, logValue, appUsername, missionId, uuids });
  } else if (logLevel === "warn") {
    serverLogger.warn({ logId, logValue, appUsername, missionId, uuids });
  } else if (logLevel === "error" && error) {
    console.error(error); // also log to console on the server
    serverLogger.error(error, { logId, logValue, appUsername, missionId, uuids });
  }
};

export default serverLogger;
