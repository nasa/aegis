import { EventEmitter } from "eventemitter3";
import type { PeerId } from "@automerge/automerge-repo";

/**
 * Stand-in for the vendor WebSocket adapter. Records the url it was constructed
 * with and whether connect/disconnect/send were delegated, and lets tests drive
 * the peer lifecycle events.
 */
class FakeInnerAdapter extends EventEmitter {
  static instances: FakeInnerAdapter[] = [];

  connectCalls = 0;
  disconnectCalls = 0;
  sent: unknown[] = [];

  constructor(
    public url: string,
    public retryInterval?: number
  ) {
    super();
    FakeInnerAdapter.instances.push(this);
  }

  connect(): void {
    this.connectCalls += 1;
  }
  disconnect(): void {
    this.disconnectCalls += 1;
  }
  send(message: unknown): void {
    this.sent.push(message);
  }
}

vi.mock("@automerge/automerge-repo-network-websocket", () => ({
  BrowserWebSocketClientAdapter: FakeInnerAdapter,
}));

const { VersionGatedNetworkAdapter } = await import("../../../client/automerge-network-adapter");

// The epoch is a uuid generated when the API process boots.
const PAGE_EPOCH = "8f14e45f-ceea-467a-9c3e-1b2c3d4e5f60";
// A restarted API — the case a bare `compose up -d` deploy produces.
const OTHER_EPOCH = "1c8a9b2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d";
const PEER_ID = "test-peer" as PeerId;

const versionResponse = (epoch: string) => ({
  ok: true,
  json: async () => ({ version: "1.2.1", gitCommit: "abc", serverEpochUuid: epoch }),
});

const makeAdapter = (
  overrides: Partial<{ onConnectionStatusChange: (status: ConnectionStatus) => void }> = {}
) =>
  new VersionGatedNetworkAdapter({
    url: "https://example.test/api/automergeSocket/",
    serverEpochUuid: PAGE_EPOCH,
    ...overrides,
  });

const lastInner = () => FakeInnerAdapter.instances[FakeInnerAdapter.instances.length - 1];

describe("VersionGatedNetworkAdapter", () => {
  beforeEach(() => {
    FakeInnerAdapter.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    // jsdom disallows assigning to window.location.href by default
    vi.stubGlobal("location", { pathname: "/mission/34", search: "", href: "" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("puts the page epoch in the socket url", () => {
    makeAdapter();
    expect(lastInner().url).toBe(
      `https://example.test/api/automergeSocket/?serverEpochUuid=${encodeURIComponent(PAGE_EPOCH)}`
    );
  });

  test("disables the inner adapter's own retry timer", () => {
    makeAdapter();
    // 0 would busy-loop rather than disable, so a very large interval is used.
    expect(lastInner().retryInterval).toBeGreaterThan(60_000);
  });

  test("becomes ready within one second even when the server is unreachable", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);

    expect(adapter.isReady()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(adapter.isReady()).toBe(true);
    await expect(adapter.whenReady()).resolves.toBeUndefined();
  });

  test("never emits close, which would remove it from the network subsystem", () => {
    const adapter = makeAdapter();
    const onClose = vi.fn();
    adapter.on("close", onClose);
    adapter.connect(PEER_ID);

    lastInner().emit("peer-candidate", { peerId: "server" as PeerId, peerMetadata: {} });
    lastInner().emit("peer-disconnected", { peerId: "server" as PeerId });
    adapter.disconnect();

    expect(onClose).not.toHaveBeenCalled();
  });

  test("keeps polling without redirecting while the server is unreachable", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(fetch).toHaveBeenCalled();
    expect(window.location.href).toBe("");
  });

  test("reconnects through the inner adapter once the epoch still matches", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(versionResponse(PAGE_EPOCH));
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);
    const inner = lastInner();
    expect(inner.connectCalls).toBe(1);

    // A dropped connection resumes polling, and a matching epoch retries.
    inner.emit("peer-candidate", { peerId: "server" as PeerId, peerMetadata: {} });
    inner.emit("peer-disconnected", { peerId: "server" as PeerId });
    await vi.advanceTimersByTimeAsync(5000);

    expect(inner.connectCalls).toBe(2);
    expect(window.location.href).toBe("");
  });

  test("blocks and redirects when the server reports a different epoch", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(versionResponse(OTHER_EPOCH));
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);
    const inner = lastInner();
    inner.emit("peer-disconnected", { peerId: "server" as PeerId });

    await vi.advanceTimersByTimeAsync(5000);

    expect(window.location.href).toBe("/versionCheck?returnUrl=%2Fmission%2F34");

    // Blocked permanently: no further polling and no further connect attempts.
    const connectCallsWhenBlocked = inner.connectCalls;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(inner.connectCalls).toBe(connectCallsWhenBlocked);
  });

  test("blocks immediately when the page itself has no epoch", () => {
    const adapter = new VersionGatedNetworkAdapter({
      url: "https://example.test/api/automergeSocket/",
      serverEpochUuid: "",
    });
    adapter.connect(PEER_ID);

    // The socket is never opened, so no stale change can reach the server.
    expect(lastInner().connectCalls).toBe(0);
    expect(window.location.href).toBe("/versionCheck?returnUrl=%2Fmission%2F34");

    // Still satisfies whenReady() so a blocked gate cannot hang the app.
    vi.advanceTimersByTime(1000);
    expect(adapter.isReady()).toBe(true);
  });

  test("blocks when the server reports no epoch at all", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.2.1", gitCommit: "abc" }),
    });
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);
    const inner = lastInner();
    inner.emit("peer-disconnected", { peerId: "server" as PeerId });

    await vi.advanceTimersByTimeAsync(5000);

    expect(window.location.href).toBe("/versionCheck?returnUrl=%2Fmission%2F34");

    const connectCallsWhenBlocked = inner.connectCalls;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(inner.connectCalls).toBe(connectCallsWhenBlocked);
  });

  test("does not forward messages to a disconnected inner adapter", () => {
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);
    const inner = lastInner();

    adapter.send({ type: "sync" } as never);
    expect(inner.sent).toHaveLength(0);

    inner.emit("peer-candidate", { peerId: "server" as PeerId, peerMetadata: {} });
    adapter.send({ type: "sync" } as never);
    expect(inner.sent).toHaveLength(1);
  });

  test("disconnecting while connected is terminal", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(versionResponse(PAGE_EPOCH));
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);
    const inner = lastInner();
    inner.emit("peer-candidate", { peerId: "server" as PeerId, peerMetadata: {} });

    const onPeerDisconnected = vi.fn();
    adapter.on("peer-disconnected", onPeerDisconnected);

    // The real vendor adapter emits peer-disconnected synchronously from here.
    adapter.disconnect();
    inner.emit("peer-disconnected", { peerId: "server" as PeerId });

    const connectCallsAtDisconnect = inner.connectCalls;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(onPeerDisconnected).not.toHaveBeenCalled();
    expect(inner.connectCalls).toBe(connectCallsAtDisconnect);
    expect(window.location.href).toBe("");
  });

  test("ignores an epoch check that resolves after disconnect", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);
    const inner = lastInner();
    const connectCallsAtStart = inner.connectCalls;

    // Kick off a poll, then shut down while its response is still pending.
    await vi.advanceTimersByTimeAsync(5000);
    adapter.disconnect();

    resolveFetch(versionResponse(OTHER_EPOCH));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(inner.connectCalls).toBe(connectCallsAtStart);
    expect(window.location.href).toBe("");
  });

  test("aborts the in-flight epoch fetch on disconnect", async () => {
    let capturedSignal: AbortSignal | undefined;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init: RequestInit) => {
        capturedSignal = init.signal ?? undefined;
        return new Promise(() => {});
      }
    );
    const adapter = makeAdapter();
    adapter.connect(PEER_ID);

    await vi.advanceTimersByTimeAsync(5000);
    expect(capturedSignal?.aborted).toBe(false);

    adapter.disconnect();
    expect(capturedSignal?.aborted).toBe(true);
  });

  test("reports connection status transitions", () => {
    const onConnectionStatusChange = vi.fn();
    const adapter = makeAdapter({ onConnectionStatusChange });
    adapter.connect(PEER_ID);
    const inner = lastInner();

    inner.emit("peer-candidate", { peerId: "server" as PeerId, peerMetadata: {} });
    inner.emit("peer-disconnected", { peerId: "server" as PeerId });

    expect(onConnectionStatusChange.mock.calls.map((call) => call[0])).toEqual([
      "connecting",
      "connected",
      "disconnected",
    ]);
  });
});
