import { createClientLogger } from "@emss/logger";
import ConsoleLogger from "./consoleLogger";

/**
 * **Do not use on server.**
 */

ConsoleLogger.setConsoleLogLevel(
  (import.meta.env.VITE_PUBLIC_CONSOLE_LOG_LEVEL as LogLevel) || "off"
);
ConsoleLogger.setRemoteLogLevel(
  (import.meta.env.VITE_PUBLIC_REMOTE_LOG_LEVEL as LogLevel) || "off"
);

ConsoleLogger.setRemoteLogger(createClientLogger("/api/v1/log/from-client"));

export { ConsoleLogger as clientLogger };
