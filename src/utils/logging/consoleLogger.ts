import type { Loggable } from "@emss/logger";

// RFC 5424: emergency(0) is most severe, debug(7) is least. "off" disables all logging.
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  off: 0,
  emergency: 1,
  alert: 2,
  critical: 3,
  error: 4,
  warning: 5,
  notice: 6,
  info: 7,
  debug: 8,
};

// ANSI color codes for terminal output
const COLORS = {
  reset: "\x1b[0m",
  boldMagenta: "\x1b[1;35m",
  magenta: "\x1b[35m",
  boldRed: "\x1b[1;31m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};

const LEVEL_COLORS: Record<Exclude<LogLevel, "off">, string> = {
  emergency: COLORS.boldMagenta,
  alert: COLORS.magenta,
  critical: COLORS.boldRed,
  error: COLORS.red,
  warning: COLORS.yellow,
  notice: COLORS.blue,
  info: COLORS.green,
  debug: COLORS.gray,
};

// Translation for which console method to use for each log level
const LEVEL_CONSOLE_METHOD: Record<Exclude<LogLevel, "off">, "error" | "warn" | "log" | "debug"> = {
  emergency: "error",
  alert: "error",
  critical: "error",
  error: "error",
  warning: "warn",
  notice: "log",
  info: "log",
  debug: "debug",
};

type ErrorLogLevel = "error" | "critical"; // levels that require an Error object
type StandardLogLevel = "emergency" | "alert" | "warning" | "notice" | "info" | "debug";

export class ConsoleLogger {
  private static consoleLogLevel: LogLevel = "off";
  private static remoteLogLevel: LogLevel = "off";
  private static remoteLogger: RemoteLogger | null = null;

  private static getTimestamp(): string {
    const iso = new Date().toISOString(); // "2026-01-08T19:30:45.123Z"
    return `[${iso.slice(5, 10)} ${iso.slice(11, 23)}]`; // "[01-08 19:30:45.123]"
  }

  private static toLoggable(input: Loggable | string): Loggable {
    return typeof input === "string" ? { logId: "aegis", logValue: input } : input;
  }

  /** Returns true if the configured level is verbose enough to include messageLevel. */
  private static shouldConsoleLog(messageLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[messageLevel] <= LOG_LEVEL_PRIORITY[this.consoleLogLevel];
  }
  private static shouldRemoteLog(messageLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[messageLevel] <= LOG_LEVEL_PRIORITY[this.remoteLogLevel];
  }

  static setConsoleLogLevel(level: LogLevel): void {
    this.consoleLogLevel = level;
  }
  static getConsoleLogLevel(): LogLevel {
    return this.consoleLogLevel;
  }

  static setRemoteLogLevel(level: LogLevel): void {
    this.remoteLogLevel = level;
  }
  static getRemoteLogLevel(): LogLevel {
    return this.remoteLogLevel;
  }

  /** Called by clientLogger.ts or serverLogger.ts at import time. */
  static setRemoteLogger(logger: RemoteLogger): void {
    this.remoteLogger = logger;
  }

  /** Logs for levels that require an Error + Loggable (error, critical). */
  private static logWithError(level: ErrorLogLevel, error: Error, logEntry: Loggable): void {
    const color = LEVEL_COLORS[level];
    const tag = level.toUpperCase();

    if (this.shouldConsoleLog(level)) {
      console[LEVEL_CONSOLE_METHOD[level]](
        `${color}${this.getTimestamp()} [${tag}]${COLORS.reset}`,
        error,
        logEntry
      );
    }

    if (this.shouldRemoteLog(level) && this.remoteLogger) {
      this.remoteLogger[level](error, logEntry);
    }
  }

  /** Logs for standard levels that just take a Loggable. */
  private static logStandard(level: StandardLogLevel, logEntry: Loggable): void {
    const color = LEVEL_COLORS[level];
    const tag = level.toUpperCase();

    if (this.shouldConsoleLog(level)) {
      console[LEVEL_CONSOLE_METHOD[level]](
        `${color}${this.getTimestamp()} [${tag}]${COLORS.reset}`,
        logEntry
      );
    }

    if (this.shouldRemoteLog(level) && this.remoteLogger) {
      this.remoteLogger[level](logEntry);
    }
  }

  static emergency(logEntry: Loggable | string): void {
    this.logStandard("emergency", this.toLoggable(logEntry));
  }

  static alert(logEntry: Loggable | string): void {
    this.logStandard("alert", this.toLoggable(logEntry));
  }

  static critical(logEntry: Loggable | string, error: Error): void {
    this.logWithError("critical", error, this.toLoggable(logEntry));
  }

  static error(logEntry: Loggable | string, error: Error): void {
    this.logWithError("error", error, this.toLoggable(logEntry));
  }

  static warning(logEntry: Loggable | string): void {
    this.logStandard("warning", this.toLoggable(logEntry));
  }

  static notice(logEntry: Loggable | string): void {
    this.logStandard("notice", this.toLoggable(logEntry));
  }

  static info(logEntry: Loggable | string): void {
    this.logStandard("info", this.toLoggable(logEntry));
  }

  static debug(logEntry: Loggable | string): void {
    this.logStandard("debug", this.toLoggable(logEntry));
  }

  /** Server-only convenience method for structured API route logging. */
  static apiRoute<T extends LogLevel>({
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
    appUsername?: string;
    missionId?: number;
    uuids?: string[];
    message?: string;
  } & (T extends "error" | "critical" ? { error: Error } : { error?: never })): void {
    const logEntry: Loggable = {
      logId: "API Route",
      logValue: `${httpMethod} ${responseStatus} ${routeName}${message ? ` ${message}` : ""}`,
      appUsername,
      missionId,
      uuids,
    };

    // Error and Critical need to also pass in the error object
    if (logLevel === "error" && error) {
      this.error(logEntry, error);
    } else if (logLevel === "critical" && error) {
      this.critical(logEntry, error);
    } else {
      // Everything else can just be passed off directly
      this[logLevel as Exclude<LogLevel, "off" | "error" | "critical">](logEntry);
    }
  }
}
export default ConsoleLogger;
