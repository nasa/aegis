/**
 * Tests for the admin DUST monitor page's socket lifecycle — specifically that
 * unmounting tears down the DUST namespace socket and leaves the inspector room on the shared app
 * socket without disconnecting it.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type * as ClientSocketHelpers from "utils/clientSocketHelpers";

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockIo, mockGetClientSocket, mockIsLoggedIn, mockGetMissionHomepageItems } = vi.hoisted(
  () => ({
    mockIo: vi.fn(),
    mockGetClientSocket: vi.fn(),
    mockIsLoggedIn: vi.fn(),
    mockGetMissionHomepageItems: vi.fn(),
  })
);

vi.mock("socket.io-client", () => ({ io: mockIo }));
vi.mock("utils/clientSocketHelpers", async (importOriginal) => ({
  ...(await importOriginal<typeof ClientSocketHelpers>()),
  getClientSocket: mockGetClientSocket,
}));
vi.mock("http-client/login", () => ({ isLoggedIn: mockIsLoggedIn }));
vi.mock("http-client/mission", () => ({ getMissionHomepageItems: mockGetMissionHomepageItems }));

const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import DustV1 from "pages/admin/dustV1";

// ── Helpers ──────────────────────────────────────────────────────────────────

const createFakeSocket = () => ({
  id: "fake-socket-id",
  connected: false,
  on: vi.fn(),
  off: vi.fn(),
  onAny: vi.fn(),
  emit: vi.fn(),
  timeout: vi.fn().mockReturnThis(),
  emitWithAck: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  // Socket.IO manager, which emits reconnect_attempt / reconnect_failed
  io: { on: vi.fn(), off: vi.fn() },
  _handlers: {} as Record<string, (...args: unknown[]) => void>,
});

type FakeSocket = ReturnType<typeof createFakeSocket>;

const withCapturedHandlers = (socket: FakeSocket): FakeSocket => {
  socket.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    socket._handlers[event] = handler;
  });
  return socket;
};

let container: HTMLDivElement;
let root: Root;
let inspectorSocket: FakeSocket;
let dustSocket: FakeSocket;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  inspectorSocket = withCapturedHandlers(createFakeSocket());
  dustSocket = withCapturedHandlers(createFakeSocket());
  dustSocket.emitWithAck.mockImplementation(async (event) => {
    if (event === "getDebugInfo") return { visitors: {}, docListenerMissionIds: [] };
    return { status: "success", message: "Mission joined" };
  });
  mockGetClientSocket.mockReturnValue(inspectorSocket);
  mockIo.mockReturnValue(dustSocket);
  mockIsLoggedIn.mockResolvedValue({ status: "success", data: { isSuperAdmin: true } });
  mockGetMissionHomepageItems.mockResolvedValue({ status: "success", data: [] });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const renderPage = async () => {
  await act(async () => {
    root.render(<DustV1 />);
  });
};

const setInput = async (placeholder: string, value: string) => {
  const input = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const connectAndJoin = async () => {
  await setInput("DUST Token", "a-token");
  await setInput("Mission ID", "9999");

  const connectButton = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Connect")
  )!;
  await act(async () => {
    connectButton.click();
  });
  // Simulate the server accepting the connection.
  dustSocket.connected = true;
  await act(async () => {
    dustSocket._handlers["connect"]?.();
  });
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DustV1 admin monitor", () => {
  it("disconnects the DUST socket on unmount and keeps the shared app socket open", async () => {
    await renderPage();
    await connectAndJoin();

    expect(dustSocket.connect).toHaveBeenCalled();
    expect(dustSocket.disconnect).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });

    expect(inspectorSocket.disconnect).not.toHaveBeenCalled();
    expect(dustSocket.removeAllListeners).toHaveBeenCalled();
    expect(dustSocket.disconnect).toHaveBeenCalled();
  });

  it("joins the inspector room on an already connected app socket and leaves it on unmount", async () => {
    inspectorSocket.connected = true;
    await renderPage();
    expect(inspectorSocket.emit).toHaveBeenCalledWith("inspectorJoin");

    await act(async () => {
      root.unmount();
    });

    expect(inspectorSocket.emit).toHaveBeenCalledWith("inspectorLeave");
    expect(inspectorSocket.off).toHaveBeenCalledWith("inspectorUpdate", expect.any(Function));
    expect(inspectorSocket.disconnect).not.toHaveBeenCalled();
  });

  it("does not throw on unmount when no DUST socket was ever created", async () => {
    await renderPage();

    await act(async () => {
      root.unmount();
    });

    expect(inspectorSocket.disconnect).not.toHaveBeenCalled();
    expect(mockIo).not.toHaveBeenCalled();
  });

  it("does not double-disconnect when the user already clicked Disconnect", async () => {
    await renderPage();
    await connectAndJoin();

    const disconnectButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Disconnect"
    )!;
    await act(async () => {
      disconnectButton.click();
    });
    expect(dustSocket.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });

    expect(dustSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("joins the mission and subscribes to posEntriesUpdate on connect", async () => {
    await renderPage();
    await connectAndJoin();

    expect(dustSocket.timeout).toHaveBeenCalledWith(15000);
    expect(dustSocket.emitWithAck).toHaveBeenCalledWith(
      "missionJoin",
      9999,
      expect.objectContaining({ name: "DUST Monitor Page" })
    );
    expect(dustSocket.emitWithAck).toHaveBeenCalledWith("getDebugInfo");
    expect(container.textContent).toContain("success: Mission joined");
    expect(dustSocket.on).toHaveBeenCalledWith("posEntriesUpdate", expect.any(Function));
  });

  it("emits getEverything for the joined mission and renders the returned rexes", async () => {
    await renderPage();
    await connectAndJoin();

    const getEverythingButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Get Everything"
    )!;
    expect(getEverythingButton.disabled).toBe(false);

    let resolveResponse: (response: unknown) => void;
    dustSocket.emitWithAck.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve;
      })
    );
    await act(async () => {
      getEverythingButton.click();
    });

    expect(dustSocket.timeout).toHaveBeenLastCalledWith(15000);
    expect(dustSocket.emitWithAck).toHaveBeenCalledWith("getEverything", 9999);
    expect(getEverythingButton.disabled).toBe(true);
    expect(container.textContent).toContain("Loading mission data...");

    await act(async () => {
      resolveResponse({
        status: "success",
        message: "Everything retrieved",
        data: [
          {
            missionId: 9999,
            missionName: "Vitest Mission",
            rexUuid: "rex-1",
            rexName: "Vitest Rex",
            evaUuid: "eva-1",
            evaName: "Vitest EVA",
            posEntries: [],
          },
        ],
      });
    });

    expect(container.textContent).toContain("Vitest Rex");
    expect(container.textContent).toContain("success: Everything retrieved");
    expect(container.textContent).not.toContain("Loading mission data...");
    expect(getEverythingButton.disabled).toBe(false);
  });

  it("shows acknowledgement timeouts and re-enables Get Everything", async () => {
    await renderPage();
    await connectAndJoin();
    dustSocket.emitWithAck.mockRejectedValueOnce(new Error("operation has timed out"));

    const getEverythingButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Get Everything"
    )!;
    await act(async () => {
      getEverythingButton.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Loading mission data: operation has timed out"
    );
    expect(container.textContent).not.toContain("Loading mission data...");
    expect(getEverythingButton.disabled).toBe(false);
  });

  it("disables Get Everything while the DUST socket is disconnected", async () => {
    await renderPage();

    const getEverythingButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Get Everything"
    )!;

    expect(getEverythingButton.disabled).toBe(true);
  });
});
