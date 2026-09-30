export type LogLevel =
  | "emergency"
  | "alert"
  | "critical"
  | "error"
  | "warning"
  | "notice"
  | "info"
  | "debug";

export type DisplayNameProps = {
  raw: string;
  center: string;
  topLevelOrgCode: string;
  secondLevelOrgCode: string;
  fullOrgCode: string;
  employer: string;
};

type LogItemServer = {
  app: string;
  from: "server" | "client" | "electron";
  auid?: string;
  uupic?: string;
  userOrg?: DisplayNameProps;
  serverName: string;
  ipAddress?: string;
};

type Primitive = string | number | boolean | bigint | null | undefined;

export type LoggableAllowedProps = {
  logId: string;
} & Record<string, Primitive | Primitive[] | Record<string, Primitive>>;

type LoggableDisallowedProps = Partial<Record<keyof LogItemServer, never>>;

/**
 * Requires a `logId` prop; any other prop names of primitive (or shallow
 * primitive collection) values are allowed, except those reserved by the
 * logging server.
 */
export type Loggable = LoggableAllowedProps & LoggableDisallowedProps;
