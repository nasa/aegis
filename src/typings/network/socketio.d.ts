declare type LaunchpadUser = import("@emss/oauth2-proxy-common").EmssUser;

// ─── Default namespace ("/") — Aegis web client ──────────────────────────────

interface ServerToClientEvents {
  statusFromServer: (payload: StatusFromServer) => void;
  version: (version: AppVersion) => void; // server version sent to client
  inspectorUpdate: (payload: ServerSocketStatus) => void;
  bannersChanged: () => void; // notification banners changed; clients refetch them over REST
}

interface ClientToServerEvents {
  visitorJoin: (visitorJoinData: VisitorJoinData) => void; // who the visitor is; sent on every connect
  visitorPageChange: (visitorPageData: VisitorPageData) => void; // which page the visitor is on
  inspectorJoin: () => void;
  inspectorLeave: () => void;
}

type ConnectionStatus = "connected" | "disconnected" | "connecting" | "reconnecting" | "failed";

// information stored in the client redux store about the socket status
interface ClientSocketStatus {
  connectionStatus: ConnectionStatus;
  lastStatusFromServer: StatusFromServer;
}

// information stored in the server's globalValues about the socket status
interface ServerSocketStatus {
  visitorsData: VisitorData[];
}

// The kind of page a visitor's tab is showing
type AppPages = "home" | "mission" | "dashboard" | "admin" | "versionCheck" | "other";

// one entry per connected AEGIS tab, stored in server's globalValues
interface VisitorData {
  socketId: string; // identifier for managing the list on server global
  clientAppVersion: AppVersion;
  appUser: AppUser | null; // null until the page has checked the login
  launchpadUser: LaunchpadUser;
  connectedAt: number; // timestamp when the visitor joined
  page: AppPages | null; // null until the client reports its page
  // set only on mission and dashboard pages after the mission permission check; the socket is in this mission's room
  missionId: number | null;
  permission: "editor" | "viewer" | null;
}

// sent by the client in visitorJoin
type VisitorJoinData = {
  appUser: AppUser | null; // null until the page has checked the login
  launchpadUser: LaunchpadUser;
  clientAppVersion: AppVersion;
  connectedAt: number;
};

// sent by the client in visitorPageChange
type VisitorPageData = {
  page: AppPages;
  missionId: number | null;
  permission: "editor" | "viewer" | null;
};

interface VisitorCounts {
  editors: number;
  viewers: number;
}

interface StatusFromServer {
  visitorCounts: VisitorCounts;
  timestamp: number;
  serverVersion: AppVersion;
}

interface AppVersion {
  version: string;
  gitCommit: string;
  /**
   * Identifies the current server epoch as a uuid generated at API boot, so it
   * changes whenever the API process restarts
   */
  serverEpochUuid: string;
}
