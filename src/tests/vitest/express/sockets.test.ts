import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { globalValues } from "server/express/global";
import { setupSocketIO } from "server/express/sockets";
import { serverLogger } from "utils/logging/serverLogger";

vi.mock("utils/logging/serverLogger", () => ({
  serverLogger: { warning: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Handler = (...args: unknown[]) => void;

// Every emit sent through io.to(room) or socket.to(room), in order
let roomEmits: { room: string; event: string; payload: unknown }[];
let connectionHandler: Handler;

const fakeIo = {
  on: (event: string, handler: Handler) => {
    if (event === "connection") connectionHandler = handler;
  },
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => roomEmits.push({ room, event, payload }),
  }),
};

const connectFakeSocket = (socketId: string) => {
  const handlers = new Map<string, Handler>();
  const socket = {
    id: socketId,
    rooms: new Set<string>(),
    emit: vi.fn(),
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    join: (room: string) => socket.rooms.add(room),
    leave: (room: string) => socket.rooms.delete(room),
    to: fakeIo.to,
    fire: (event: string, ...args: unknown[]) => handlers.get(event)(...args),
  };
  connectionHandler(socket);
  return socket;
};

const appVersion: AppVersion = { version: "1", gitCommit: "abc", serverEpochUuid: "epoch" };
const joinData = (username: string, connectedAt = 1000): VisitorJoinData => ({
  clientAppVersion: appVersion,
  appUser: { username } as AppUser,
  launchpadUser: { auid: `${username}-auid` } as LaunchpadUser,
  connectedAt,
});
const missionPage = (
  missionId: number,
  permission: "editor" | "viewer" = "editor"
): VisitorPageData => ({
  page: "mission",
  missionId,
  permission,
});
const homePage: VisitorPageData = {
  page: "home",
  missionId: null,
  permission: null,
};

const statusEmitsTo = (room: string) =>
  roomEmits
    .filter((emit) => emit.room === room && emit.event === "statusFromServer")
    .map((emit) => (emit.payload as StatusFromServer).visitorCounts);

beforeEach(() => {
  vi.clearAllMocks();
  roomEmits = [];
  globalValues.serverSocketStatus.visitorsData.length = 0;
  globalValues.appVersion = appVersion;
  globalValues.socketio = fakeIo as unknown as GlobalValues["socketio"];
  setupSocketIO();
});

afterEach(() => {
  clearInterval(globalValues.socketInterval);
  globalValues.socketInterval = null;
  globalValues.socketio = null;
  globalValues.serverSocketStatus.visitorsData.length = 0;
});

describe("default namespace visitors", () => {
  test("visitorJoin records the visitor without joining a mission room", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("visitorJoin", joinData("alice"));

    expect(globalValues.serverSocketStatus.visitorsData).toEqual([
      {
        socketId: "socket-a",
        ...joinData("alice"),
        page: null,
        missionId: null,
        permission: null,
      },
    ]);
    expect(socket.rooms.size).toBe(0);
    expect(roomEmits.some((emit) => emit.event === "statusFromServer")).toBe(false);
  });

  test("a non-mission page is recorded without joining a room", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("visitorJoin", joinData("alice"));
    socket.fire("visitorPageChange", { ...homePage, page: "admin" });

    expect(globalValues.serverSocketStatus.visitorsData[0]).toMatchObject({
      page: "admin",
      missionId: null,
    });
    expect(socket.rooms.size).toBe(0);
  });

  test("a mission page joins the mission room and sends its counts", () => {
    const editor = connectFakeSocket("socket-a");
    editor.fire("visitorJoin", joinData("alice"));
    editor.fire("visitorPageChange", missionPage(4));
    const viewer = connectFakeSocket("socket-b");
    viewer.fire("visitorJoin", joinData("bob"));
    viewer.fire("visitorPageChange", { ...missionPage(4, "viewer"), page: "dashboard" });

    expect([...editor.rooms]).toEqual(["4"]);
    expect([...viewer.rooms]).toEqual(["4"]);
    expect(statusEmitsTo("4")).toEqual([
      { editors: 1, viewers: 0 },
      { editors: 1, viewers: 1 },
    ]);
  });

  test("switching missions leaves the previous mission room", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("visitorJoin", joinData("alice"));
    socket.fire("visitorPageChange", missionPage(4));
    socket.fire("visitorPageChange", missionPage(5));

    expect([...socket.rooms]).toEqual(["5"]);
    expect(statusEmitsTo("4")).toEqual([
      { editors: 1, viewers: 0 },
      { editors: 0, viewers: 0 },
    ]);
    expect(statusEmitsTo("5")).toEqual([{ editors: 1, viewers: 0 }]);
  });

  test("leaving a mission for the home page leaves the room and stops counting the visitor", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("visitorJoin", joinData("alice"));
    socket.fire("visitorPageChange", missionPage(4));
    socket.fire("visitorPageChange", homePage);

    expect(socket.rooms.size).toBe(0);
    expect(globalValues.serverSocketStatus.visitorsData[0]).toMatchObject({
      page: "home",
      missionId: null,
      permission: null,
    });
    expect(statusEmitsTo("4").at(-1)).toEqual({ editors: 0, viewers: 0 });
  });

  test("visitorJoin sent again keeps the reported page, mission and connect time", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("visitorJoin", { ...joinData("alice"), appUser: null });
    socket.fire("visitorPageChange", missionPage(4));
    socket.fire("visitorJoin", joinData("alice", 5000));

    expect(globalValues.serverSocketStatus.visitorsData).toHaveLength(1);
    expect(globalValues.serverSocketStatus.visitorsData[0]).toMatchObject({
      appUser: { username: "alice" },
      connectedAt: 1000,
      page: "mission",
      missionId: 4,
      permission: "editor",
    });
    expect([...socket.rooms]).toEqual(["4"]);
  });

  test("a page change before visitorJoin is ignored", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("visitorPageChange", missionPage(4));
    expect(globalValues.serverSocketStatus.visitorsData).toHaveLength(0);
    expect(socket.rooms.size).toBe(0);
  });

  test("malformed payloads are logged as errors without throwing", () => {
    const socket = connectFakeSocket("socket-a");
    expect(() => socket.fire("visitorJoin", null)).not.toThrow();
    expect(() => socket.fire("visitorJoin", undefined)).not.toThrow();
    expect(serverLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: "socket:visitorJoin:unhandledErrorWhileProcessingVisitorJoin",
      }),
      expect.any(Error)
    );

    socket.fire("visitorJoin", joinData("alice"));
    expect(() => socket.fire("visitorPageChange", null)).not.toThrow();
    expect(serverLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: "socket:visitorPageChange:unhandledErrorWhileProcessingPageChange",
      }),
      expect.any(Error)
    );
  });

  test("a page change without a missionId counts as no mission and does not break the heartbeat or disconnect", () => {
    vi.useFakeTimers();
    try {
      // The heartbeat interval is created on the first connection, so connect under fake timers
      const socket = connectFakeSocket("socket-a");
      socket.fire("visitorJoin", joinData("alice"));
      socket.fire("visitorPageChange", missionPage(4));
      expect(() => socket.fire("visitorPageChange", { page: "mission" })).not.toThrow();

      expect(socket.rooms.size).toBe(0);
      expect(statusEmitsTo("4").at(-1)).toEqual({ editors: 0, viewers: 0 });
      expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
      expect(() => socket.fire("disconnect")).not.toThrow();
      expect(serverLogger.error).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("disconnect removes the visitor and updates its mission room", () => {
    const leaving = connectFakeSocket("socket-a");
    leaving.fire("visitorJoin", joinData("alice"));
    leaving.fire("visitorPageChange", missionPage(4));
    const staying = connectFakeSocket("socket-b");
    staying.fire("visitorJoin", joinData("bob"));
    staying.fire("visitorPageChange", missionPage(4, "viewer"));

    leaving.fire("disconnect");

    expect(globalValues.serverSocketStatus.visitorsData.map((v) => v.socketId)).toEqual([
      "socket-b",
    ]);
    expect(statusEmitsTo("4").at(-1)).toEqual({ editors: 0, viewers: 1 });
  });

  test("inspectorLeave leaves the inspector room", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("inspectorJoin");
    expect(socket.rooms.has("inspector")).toBe(true);

    socket.fire("inspectorLeave");
    expect(socket.rooms.has("inspector")).toBe(false);
  });
});
