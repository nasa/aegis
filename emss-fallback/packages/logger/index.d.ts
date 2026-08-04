import type { Request, Response } from "express";
import type { Loggable, LogLevel } from "./types";

type ServerLogger = {
  emergency: (loggable: Loggable) => Promise<unknown>;
  alert: (loggable: Loggable) => Promise<unknown>;
  critical: (err: Error, loggable: Loggable) => Promise<unknown>;
  error: (err: Error, loggable: Loggable) => Promise<unknown>;
  warning: (loggable: Loggable) => Promise<unknown>;
  notice: (loggable: Loggable) => Promise<unknown>;
  info: (loggable: Loggable) => Promise<unknown>;
  debug: (loggable: Loggable) => Promise<unknown>;
  forwardFromClient: (
    loggable: Loggable & { logLevel: LogLevel },
    user: unknown
  ) => Promise<unknown>;
  logUserLogin: (user: unknown) => Promise<unknown>;
};

type CreateServerLoggerProps = {
  logEnableAppLogging: boolean;
  logServerHttpEndpoint: string;
  logDataAppId: string;
  logDataServerName: string;
};

export declare const createServerLogger: (props: CreateServerLoggerProps) => ServerLogger;

export declare const sendClientLogsToLogstash: (args: {
  req: Request;
  res: Response;
  user: unknown;
  serverLogger: ServerLogger;
}) => unknown;
