import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { globalValues } from "server/express/global";
import { isValidVisitorPageData, setupSocketIO } from "server/express/sockets";

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

  test("a page change before visitorJoin or with an invalid payload is ignored", () => {
    const socket = connectFakeSocket("socket-a");
    socket.fire("visitorPageChange", missionPage(4));
    expect(globalValues.serverSocketStatus.visitorsData).toHaveLength(0);
    expect(socket.rooms.size).toBe(0);

    socket.fire("visitorJoin", joinData("alice"));
    socket.fire("visitorPageChange", { ...homePage, missionId: 4, permission: "editor" });
    expect(globalValues.serverSocketStatus.visitorsData[0].missionId).toBeNull();
    expect(socket.rooms.size).toBe(0);
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

describe("isValidVisitorPageData", () => {
  test("accepts mission ids only with a permission on mission and dashboard pages", () => {
    expect(isValidVisitorPageData(homePage)).toBe(true);
    expect(isValidVisitorPageData(missionPage(4))).toBe(true);
    expect(isValidVisitorPageData({ ...missionPage(4), page: "dashboard" })).toBe(true);
    expect(isValidVisitorPageData({ ...missionPage(4), missionId: null, permission: null })).toBe(
      true
    );

    expect(isValidVisitorPageData({ ...missionPage(4), page: "admin" })).toBe(false);
    expect(isValidVisitorPageData({ ...missionPage(4), permission: null })).toBe(false);
    expect(isValidVisitorPageData({ ...homePage, permission: "editor" })).toBe(false);
    expect(isValidVisitorPageData({ ...missionPage(4), missionId: "4" })).toBe(false);
    expect(isValidVisitorPageData({ ...homePage, page: "unknown" })).toBe(false);
    expect(isValidVisitorPageData(null)).toBe(false);
  });
});
