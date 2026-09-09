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
    this.#inner.on("peer-candidate", (payload) => {
      this.#peerConnected = true;
      this.#stopPolling();
      this.#setStatus("connected");
      this.emit("peer-candidate", payload);
    });
    this.#inner.on("peer-disconnected", (payload) => {
      this.#peerConnected = false;
      this.#setStatus("disconnected");
      this.#startPolling();
      this.emit("peer-disconnected", payload);
    });
    this.#inner.on("message", (payload) => {
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

    this.#setStatus("connecting");
    this.#connectInner();
    this.#startPolling();

    setTimeout(() => this.#forceReady(), FORCE_READY_MS);
  }

  send(message: Message): void {
    if (this.#blocked || !this.#peerConnected) return;
    this.#inner.send(message);
  }

  disconnect(): void {
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
    if (this.#blocked || this.#peerConnected || !this.peerId) return;
    this.#innerConnectStarted = true;
    this.#inner.connect(this.peerId, this.peerMetadata);
  }

  #startPolling(): void {
    if (this.#blocked || this.#pollId) return;
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
    if (this.#blocked) return;

    let serverVersion: AppVersion;
    try {
      const res = await fetch(`/api/v1/version?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return;
      serverVersion = (await res.json()) as AppVersion;
    } catch {
      // Server unreachable (down, mid-deploy, proxy error). Keep the page in its
      // disconnected state and keep polling; reloading now would land the user
      // on an error page.
      return;
    }

    if (!serverVersion?.serverEpochUuid) return;
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

    clientLogger.warning({
      logId: "automergeGate",
      logValue: `Server epoch changed; a reload is required. page epoch: ${this.#serverEpochUuid}, server epoch: ${serverEpoch}`,
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
