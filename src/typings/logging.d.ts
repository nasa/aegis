/**
 * RFC 5424 log levels used by ConsoleLogger.
 * "off" disables all logging.
 */
type LogLevel =
  | "off"
  | "emergency"
  | "alert"
  | "critical"
  | "error"
  | "warning"
  | "notice"
  | "info"
  | "debug";

/**
 * Minimal interface for the remote logger created by @emss/logger.
 * Both ClientLogger and ServerLogger satisfy this shape for the common log methods.
 * The `error` and `critical` methods take an Error as the first argument.
 */
interface RemoteLogger {
  emergency: (loggable: import("@emss/logger").Loggable, ...rest: unknown[]) => Promise<unknown>;
  alert: (loggable: import("@emss/logger").Loggable, ...rest: unknown[]) => Promise<unknown>;
  critical: (
    err: Error,
    loggable: import("@emss/logger").Loggable,
    ...rest: unknown[]
  ) => Promise<unknown>;
  error: (
    err: Error,
    loggable: import("@emss/logger").Loggable,
    ...rest: unknown[]
  ) => Promise<unknown>;
  warning: (loggable: import("@emss/logger").Loggable, ...rest: unknown[]) => Promise<unknown>;
  notice: (loggable: import("@emss/logger").Loggable, ...rest: unknown[]) => Promise<unknown>;
  info: (loggable: import("@emss/logger").Loggable, ...rest: unknown[]) => Promise<unknown>;
  debug: (loggable: import("@emss/logger").Loggable, ...rest: unknown[]) => Promise<unknown>;
  [key: string]: unknown;
}
