import {
  attachSocketListeners,
  createClientSocket,
  getVisitorPageData,
  isProductionServerURL,
  joinInspectorRoom,
} from "utils/clientSocketHelpers";

const ioMock = vi.hoisted(() =>
  vi.fn((_url: string, _options: Record<string, unknown>) => ({}) as never)
);

vi.mock("socket.io-client", () => ({ io: ioMock }));

describe("isProductionServerURL", () => {
  test("matches the production origin browsers actually pass", () => {
    // Every browser caller passes window.location.origin, not a bare hostname.
    expect(isProductionServerURL("https://aegis.fit.nasa.gov")).toBe(true);
    expect(isProductionServerURL("https://aegis.fit.nasa.gov/")).toBe(true);
  });

  test("matches a bare hostname, which load testing may pass", () => {
    expect(isProductionServerURL("aegis.fit.nasa.gov")).toBe(true);
  });

  test("does not match non-production origins", () => {
    expect(isProductionServerURL("https://aegis-dev.fit.nasa.gov")).toBe(false);
    expect(isProductionServerURL("https://localhost:8000")).toBe(false);
    expect(isProductionServerURL("http://aegis.fit.nasa.gov.evil.test")).toBe(false);
  });
});

describe("createClientSocket", () => {
  beforeEach(() => {
    ioMock.mockClear();
  });

  test("retries forever in production", () => {
    createClientSocket("https://aegis.fit.nasa.gov");
    expect(ioMock.mock.calls[0][1]).toMatchObject({ reconnectionAttempts: Infinity });
  });

  test("uses a bounded retry count everywhere else", () => {
    createClientSocket("https://localhost:8000");
    expect(ioMock.mock.calls[0][1]).toMatchObject({ reconnectionAttempts: 500 });
  });
});

const editorPerms = (missionId: number): Permission => ({
  missionId,
  permissions: { view: true, edit: true },
});

describe("getVisitorPageData", () => {
  test("reports the page kind for every route", () => {
    expect(getVisitorPageData("/", null).page).toBe("home");
    expect(getVisitorPageData("/mission/4", null).page).toBe("mission");
    expect(getVisitorPageData("/dashboard/4", null).page).toBe("dashboard");
    expect(getVisitorPageData("/admin", null).page).toBe("admin");
    expect(getVisitorPageData("/admin/mission/4", null).page).toBe("admin");
    expect(getVisitorPageData("/versionCheck", null).page).toBe("versionCheck");
    expect(getVisitorPageData("/testMapPerformant", null).page).toBe("other");
  });

  test("joins a mission only once permissions for that mission are loaded", () => {
    expect(getVisitorPageData("/mission/4", null)).toEqual({
      page: "mission",
      missionId: null,
      permission: null,
    });
    expect(getVisitorPageData("/mission/4", editorPerms(4))).toEqual({
      page: "mission",
      missionId: 4,
      permission: "editor",
    });
    expect(
      getVisitorPageData("/dashboard/4", { missionId: 4, permissions: { view: true, edit: false } })
    ).toMatchObject({ missionId: 4, permission: "viewer" });
  });

  test("does not join with another mission's permissions", () => {
    // The previous mission's permissions stay in the store until the new page loads its own
    expect(getVisitorPageData("/mission/5", editorPerms(4))).toMatchObject({
      missionId: null,
      permission: null,
    });
  });

  test("does not join a mission from admin pages or without view access", () => {
    expect(getVisitorPageData("/admin/mission/4", editorPerms(4)).missionId).toBeNull();
    expect(
      getVisitorPageData("/mission/4", { missionId: 4, permissions: { view: false, edit: false } })
        .missionId
    ).toBeNull();
  });
});

const createFakeSocket = (connected: boolean) => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const managerHandlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const addHandler =
    (map: typeof handlers) => (event: string, handler: (...args: unknown[]) => void) => {
      if (!map.has(event)) map.set(event, new Set());
      map.get(event).add(handler);
    };
  const removeHandler =
    (map: typeof handlers) => (event: string, handler: (...args: unknown[]) => void) => {
      map.get(event)?.delete(handler);
    };
  return {
    id: "fake-socket-id",
    connected,
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(addHandler(handlers)),
    off: vi.fn(removeHandler(handlers)),
    io: { on: vi.fn(addHandler(managerHandlers)), off: vi.fn(removeHandler(managerHandlers)) },
    fire: (event: string, ...args: unknown[]) =>
      handlers.get(event)?.forEach((handler) => handler(...args)),
    fireManager: (event: string, ...args: unknown[]) =>
      managerHandlers.get(event)?.forEach((handler) => handler(...args)),
    handlerCount: () =>
      [...handlers.values(), ...managerHandlers.values()].reduce(
        (total, set) => total + set.size,
        0
      ),
  };
};

const appVersion: AppVersion = { version: "1", gitCommit: "abc", serverEpochUuid: "epoch" };
const userState = {
  appUser: { username: "vitest-user" },
  launchpadUser: { auid: "vitest-auid" },
  missionPerms: editorPerms(4),
} as UserState;
const connectionState = {
  clientAppVersion: appVersion,
  socketStatus: { lastStatusFromServer: {} },
} as ConnectionState;
const missionPageData: VisitorPageData = {
  page: "mission",
  missionId: 4,
  permission: "editor",
};

describe("attachSocketListeners", () => {
  const attach = (socket: ReturnType<typeof createFakeSocket>, dispatch = vi.fn()) =>
    attachSocketListeners(
      socket as never,
      dispatch,
      { current: connectionState },
      { current: userState },
      { current: missionPageData }
    );

  test("sends visitorJoin and then the current page on every connect", () => {
    const socket = createFakeSocket(false);
    attach(socket);
    expect(socket.emit).not.toHaveBeenCalled();

    socket.fire("connect");
    socket.fire("connect"); // reconnect: the server forgot the visitor and its rooms

    expect(socket.emit.mock.calls.map(([event]) => event)).toEqual([
      "visitorJoin",
      "visitorPageChange",
      "visitorJoin",
      "visitorPageChange",
    ]);
    expect(socket.emit.mock.calls[0][1]).toMatchObject({
      clientAppVersion: appVersion,
      appUser: userState.appUser,
      launchpadUser: userState.launchpadUser,
    });
    expect(socket.emit.mock.calls[1][1]).toEqual(missionPageData);
  });

  test("reports immediately when the shared socket is already connected", () => {
    const socket = createFakeSocket(true);
    attach(socket);
    expect(socket.emit.mock.calls.map(([event]) => event)).toEqual([
      "visitorJoin",
      "visitorPageChange",
    ]);
  });

  test("removes only its own listeners and leaves the socket connected", () => {
    const socket = createFakeSocket(false);
    const otherHandler = vi.fn();
    socket.on("connect", otherHandler);
    const detach = attach(socket);

    detach();

    expect(socket.handlerCount()).toBe(1);
    socket.fire("connect");
    expect(otherHandler).toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe("joinInspectorRoom", () => {
  test("joins on every connect and leaves on cleanup without disconnecting", () => {
    const socket = createFakeSocket(false);
    const onConnectionStatusChange = vi.fn();
    const onInspectorUpdate = vi.fn();
    const leave = joinInspectorRoom(socket as never, onConnectionStatusChange, onInspectorUpdate);

    socket.fire("connect");
    socket.fire("disconnect");
    socket.fire("connect");
    socket.fire("inspectorUpdate", { visitorsData: [] });
    expect(socket.emit.mock.calls).toEqual([["inspectorJoin"], ["inspectorJoin"]]);
    expect(onConnectionStatusChange.mock.calls).toEqual([
      ["connected"],
      ["disconnected"],
      ["connected"],
    ]);
    expect(onInspectorUpdate).toHaveBeenCalledWith({ visitorsData: [] });

    socket.connected = true;
    leave();
    expect(socket.emit).toHaveBeenLastCalledWith("inspectorLeave");
    expect(socket.handlerCount()).toBe(0);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  test("reports reconnecting while retrying and failed only when retries are exhausted", () => {
    const socket = createFakeSocket(false);
    const onConnectionStatusChange = vi.fn();
    joinInspectorRoom(socket as never, onConnectionStatusChange, vi.fn());

    socket.fire("connect_error", new Error("server unreachable"));
    socket.fireManager("reconnect_attempt");
    expect(onConnectionStatusChange.mock.calls).toEqual([["reconnecting"]]);

    socket.fireManager("reconnect_failed");
    expect(onConnectionStatusChange).toHaveBeenLastCalledWith("failed");
  });
});
