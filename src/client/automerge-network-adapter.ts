import { EventEmitter } from "eventemitter3";
import type {
  NetworkAdapterEvents,
  NetworkAdapterInterface,
  PeerId,
  PeerMetadata,
} from "@automerge/automerge-repo";
import type { Message } from "@automerge/automerge-repo";
import { BrowserWebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { clientLogger } from "utils/logging/clientLogger";

/** How often to re-check the server epoch while disconnected. */
const POLL_INTERVAL_MS = 5000;

/**
 * The inner adapter installs its own unconditional retry timer at construction
 * time and there is no way to disable it — passing 0 produces a busy loop rather
 * than "off". A very large interval keeps it dormant so this wrapper owns retry
 * timing exclusively.
 */
const INNER_RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The inner adapter force-readies after one second so an unreachable server
 * cannot block Repo construction. This wrapper must do the same, otherwise a
 * blocked gate would hang every `whenReady()` caller in the application.
 */
const FORCE_READY_MS = 1000;

type ConnectionStatusHandler = (status: ConnectionStatus) => void;

export interface VersionGatedNetworkAdapterOptions {
  /** Automerge WebSocket endpoint, without a query string. */
  url: string;
  /** The epoch this page was loaded with. */
  serverEpochUuid: string;
  /** Called on every Automerge connection status transition. */
  onConnectionStatusChange?: ConnectionStatusHandler;
}

/**
 * Stands in for an epoch that is absent rather than merely different. A missing
 * epoch means one side predates the gate, which is treated exactly like a
 * mismatch: the socket is never opened and the page is sent through a reload.
 */
const MISSING_EPOCH = "(missing)";

/**
 * Wraps the vendor WebSocket adapter and refuses to connect once the server
 * reports a different database epoch than the one this page was loaded with.
 *
 * A page whose epoch is stale is holding in-memory Automerge changes authored
 * against a pre-restart document. Those changes must never reach the server, so
 * the wrapper never delegates to the inner adapter and instead sends the user
 * through a full page reload, which discards all client state (the client Repo
 * has no storage adapter, so nothing survives a reload).
 *
 * Composition rather than a from-scratch adapter keeps the CBOR wire protocol
 * vendor-owned.
 */
export class VersionGatedNetworkAdapter
  extends EventEmitter<NetworkAdapterEvents>
  implements NetworkAdapterInterface
{
  peerId?: PeerId;
  peerMetadata?: PeerMetadata;

  readonly #inner: BrowserWebSocketClientAdapter;
  readonly #serverEpochUuid: string;
  readonly #onConnectionStatusChange?: ConnectionStatusHandler;

  /** Guards inner.disconnect() and inner.send(), which assert on peerId/socket. */
  #innerConnectStarted = false;
  /** True between peer-candidate and peer-disconnected. */
  #peerConnected = false;
  /** Set once on an epoch mismatch and never cleared. */
  #blocked = false;
  /** True between connect() and disconnect(); disconnect() must be terminal. */
  #active = false;
  /**
   * Bumped by every connect() and disconnect(). Work started under an earlier
   * lifecycle — a pending epoch fetch above all — compares the generation it
   * captured against this and discards itself when they differ.
   */
  #generation = 0;
  /** Aborts the in-flight epoch fetch, if any, when the lifecycle ends. */
  #abortController?: AbortController;
  #pollId?: ReturnType<typeof setInterval>;
  #ready = false;
  #readyResolver: () => void;
  readonly #readyPromise: Promise<void>;

  constructor(options: VersionGatedNetworkAdapterOptions) {
    super();
    this.#serverEpochUuid = options.serverEpochUuid;
    this.#onConnectionStatusChange = options.onConnectionStatusChange;
    this.#readyPromise = new Promise<void>((resolve) => {
      this.#readyResolver = resolve;
    });

    const separator = options.url.includes("?") ? "&" : "?";
    const url = `${options.url}${separator}serverEpochUuid=${encodeURIComponent(
      options.serverEpochUuid
    )}`;
    this.#inner = new BrowserWebSocketClientAdapter(url, INNER_RETRY_INTERVAL_MS);

    // Forward only the events the NetworkSubsystem needs. "close" is
    // deliberately never emitted or forwarded: it permanently removes the
    // adapter from the subsystem.
    // Events that arrive while inactive are ignored. inner.disconnect() emits
    // peer-disconnected synchronously, so without this the wrapper would resume
    // polling — and eventually reconnect — from inside its own disconnect().
    this.#inner.on("peer-candidate", (payload) => {
      if (!this.#active) return;
      this.#peerConnected = true;
      this.#stopPolling();
      this.#setStatus("connected");
      this.emit("peer-candidate", payload);
    });
    this.#inner.on("peer-disconnected", (payload) => {
      if (!this.#active) return;
      this.#peerConnected = false;
      this.#setStatus("disconnected");
      this.#startPolling();
      this.emit("peer-disconnected", payload);
    });
    this.#inner.on("message", (payload) => {
      if (!this.#active) return;
      this.emit("message", payload);
    });
  }

  isReady(): boolean {
    return this.#ready;
  }

  whenReady(): Promise<void> {
    return this.#readyPromise;
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    this.#active = true;
    this.#generation += 1;
    this.#abortController = new AbortController();

    // Force-ready first: a page with no epoch blocks immediately below, and a
    // blocked gate must still satisfy every whenReady() caller.
    setTimeout(() => this.#forceReady(), FORCE_READY_MS);

    // Without an epoch the server would reject the upgrade anyway, so skip the
    // doomed socket and go straight to the reload.
    if (!this.#serverEpochUuid) {
      this.#setStatus("connecting");
      this.#block(MISSING_EPOCH);
      return;
    }

    this.#setStatus("connecting");
    this.#connectInner();
    this.#startPolling();
  }

  send(message: Message): void {
    if (this.#blocked || !this.#active || !this.#peerConnected) return;
    this.#inner.send(message);
  }

  disconnect(): void {
    // Deactivate before touching the inner adapter so the peer-disconnected it
    // emits, and any epoch fetch already in flight, are both discarded.
    this.#active = false;
    this.#generation += 1;
    this.#abortController?.abort();
    this.#abortController = undefined;
    this.#stopPolling();
    if (this.#innerConnectStarted) {
      this.#inner.disconnect();
      this.#innerConnectStarted = false;
      this.#peerConnected = false;
    }
  }

  /**
   * The inner adapter's own retry timer is effectively disabled, so every
   * (re)connection attempt is driven from here after an epoch check.
   */
  #connectInner(): void {
    if (this.#blocked || !this.#active || this.#peerConnected) return;
    if (!this.peerId || !this.#serverEpochUuid) return;
    this.#innerConnectStarted = true;
    this.#inner.connect(this.peerId, this.peerMetadata);
  }

  #startPolling(): void {
    if (this.#blocked || !this.#active || this.#pollId) return;
    this.#pollId = setInterval(() => {
      this.#checkEpoch();
    }, POLL_INTERVAL_MS);
  }

  #stopPolling(): void {
    if (!this.#pollId) return;
    clearInterval(this.#pollId);
    this.#pollId = undefined;
  }

  async #checkEpoch(): Promise<void> {
    if (this.#blocked || !this.#active) return;
    const generation = this.#generation;

    let serverVersion: AppVersion;
    try {
      const res = await fetch(`/api/v1/version?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: this.#abortController?.signal,
      });
      if (!res.ok) return;
      serverVersion = (await res.json()) as AppVersion;
    } catch {
      // Server unreachable (down, mid-deploy, proxy error) or the fetch was
      // aborted by disconnect(). Keep the page in its disconnected state and
      // keep polling; reloading now would land the user on an error page.
      return;
    }

    // disconnect() may have run while the response was in flight. Acting on it
    // now would reconnect or redirect after the adapter was shut down.
    if (!this.#active || generation !== this.#generation) return;

    // A server that reports no epoch predates the gate. Treat that exactly like
    // a mismatch rather than waiting for an epoch that will never arrive.
    if (!serverVersion?.serverEpochUuid) {
      this.#block(MISSING_EPOCH);
      return;
    }
    if (serverVersion.serverEpochUuid === this.#serverEpochUuid) {
      this.#connectInner();
      return;
    }

    this.#block(serverVersion.serverEpochUuid);
  }

  #block(serverEpoch: string): void {
    this.#blocked = true;
    this.#stopPolling();
    if (this.#innerConnectStarted) {
      this.#inner.disconnect();
      this.#innerConnectStarted = false;
      this.#peerConnected = false;
    }
    this.#setStatus("disconnected");

    const pageEpoch = this.#serverEpochUuid || MISSING_EPOCH;
    const reason =
      pageEpoch === MISSING_EPOCH || serverEpoch === MISSING_EPOCH
        ? "An epoch is missing, so this page predates the gate"
        : "The server epoch changed";
    clientLogger.warning({
      logId: "automergeGate",
      logValue: `${reason}; a reload is required. page epoch: ${pageEpoch}, server epoch: ${serverEpoch}`,
    });

    const currentUrl = window.location.pathname + window.location.search;
    window.location.href = `/versionCheck?returnUrl=${encodeURIComponent(currentUrl)}`;
  }

  #forceReady(): void {
    if (this.#ready) return;
    this.#ready = true;
    this.#readyResolver();
  }

  #setStatus(status: ConnectionStatus): void {
    this.#onConnectionStatusChange?.(status);
  }
}
