import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { getMissionHomepageItems } from "http-client/mission";
import React from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { createClientSocket } from "utils/clientSocketHelpers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlug, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import adminCommon from "./adminCommon.module.css";
import type { DustDebugInfo, DustPosEntriesUpdate } from "server/dust/v1/types/socketioDust";

// ─── DUST v1 namespace connection ──────────────────────────────────────────────
// v1 lives on the /api/socket server under the /dust/v1 namespace.
// Future major versions would use /dust/v2, /dust/v3, ... on the same server.

const createDustSocket = (
  serverURL: string,
  dustToken: string
): Socket<DustServerToClientEventsV1, DustClientToServerEventsV1> => {
  return io(`${serverURL}/dust/v1`, {
    transports: ["websocket"],
    upgrade: true,
    path: "/api/socket",
    auth: { token: dustToken },
    autoConnect: false,
  }) as unknown as Socket<DustServerToClientEventsV1, DustClientToServerEventsV1>;
};

// ─── Shared input style ───────────────────────────────────────────────────────

const wideInput: React.CSSProperties = { width: "100%", minWidth: 0, boxSizing: "border-box" };
const narrowInput: React.CSSProperties = { width: "120px" };

// ─── Emit card ────────────────────────────────────────────────────────────────

const EmitCard: FunctionComponent<{
  title: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}> = ({ title, children, fullWidth }) => (
  <div
    className={adminCommon.details}
    style={{
      marginTop: 0,
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      height: "100%",
      boxSizing: "border-box",
      gridColumn: fullWidth ? "1 / -1" : undefined,
    }}
  >
    <h3 style={{ margin: 0, fontSize: "0.95rem", color: "#f1f5f9" }}>
      <code>{title}</code>
    </h3>
    {children}
  </div>
);

// ─── Main page component ──────────────────────────────────────────────────────

const DustV1: React.FunctionComponent = () => {
  const navigate = useNavigate();

  // Inspector socket (default namespace on the /api/socket server).
  const inspectorSocket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [inspectorConnectionStatus, setInspectorConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [missionNames, setMissionNames] = useState<Map<number, string>>(new Map());

  // DUST v1 namespace socket
  const dustSocket = useRef<Socket<DustServerToClientEventsV1, DustClientToServerEventsV1>>(null);
  const [dustConnectionStatus, setDustConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [dustSocketId, setDustSocketId] = useState<string | null>(null);

  // ── Connect + missionJoin form ───────────────────────────────────────────
  const [dustToken, setDustToken] = useState<string>("");
  const [joinMissionId, setJoinMissionId] = useState<string>("");
  const [joinVisitorName, setJoinVisitorName] = useState<string>("DUST Monitor Page");
  const [joinResponseMessage, setJoinResponseMessage] = useState<string | null>(null);

  // ── DUST v1 debug info (visitors) ─────────────────────────────────────────
  // Fetched via the /dust namespace's `getDebugInfo` event — requires a
  // DUST-authenticated socket, i.e. after "Connect & Join" has run.
  const [debugInfo, setDebugInfo] = useState<DustDebugInfo | null>(null);

  // ── posEntriesUpdate (received from server) ──────────────────────────────
  // Simulates what a real DUST server receives when a running rex's crew
  // positions change. Populated by the `posEntriesUpdate` server-to-client event.
  const [lastPosEntriesUpdate, setLastPosEntriesUpdate] = useState<DustPosEntriesUpdate | null>(
    null
  );

  const refreshDebugInfo = () => {
    if (!dustSocket.current?.connected) return;
    dustSocket.current.emit("getDebugInfo", (data) => {
      setDebugInfo(data);
    });
  };

  // ── Auth check + inspector socket setup ──────────────────────────────────
  useEffect(() => {
    // Create the inspector socket synchronously so React can attach a matching
    // cleanup that actually runs on unmount (returning cleanup from an async
    // IIFE would be discarded by React).
    if (!inspectorSocket.current || !inspectorSocket.current.connected) {
      inspectorSocket.current = createClientSocket(window.location.origin);
    }
    const socket = inspectorSocket.current;

    socket.on("connect", () => {
      socket.emit("inspectorJoin");
      setInspectorConnectionStatus("connected");
    });

    socket.on("disconnect", () => {
      setInspectorConnectionStatus("disconnected");
    });

    socket.on("inspectorUpdate", () => {
      setLastUpdatedAt(new Date().toISOString());
    });

    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        if (!response.data.isSuperAdmin) {
          navigate("/");
        }
      } else {
        navigate("/");
      }

      const missionsRes = await getMissionHomepageItems();
      if (missionsRes.status === "success" && missionsRes.data) {
        const nameMap = new Map<number, string>();
        missionsRes.data.forEach((m) => nameMap.set(m.id, m.name));
        setMissionNames(nameMap);
      }
    })();

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("inspectorUpdate");
      socket.disconnect();
    };
  }, [navigate]);

  // ── DUST socket lifecycle ──────────────────────────────────────────────────

  const connectAndJoin = () => {
    if (!dustToken.trim() || !joinMissionId) return;

    if (dustSocket.current) {
      dustSocket.current.removeAllListeners();
      dustSocket.current.disconnect();
    }

    const sock = createDustSocket(window.location.origin, dustToken.trim());
    dustSocket.current = sock;

    sock.on("connect", () => {
      const socketId = sock.id;
      setDustSocketId(socketId ?? null);
      setDustConnectionStatus("connected");
      const missionId = Number(joinMissionId);
      const dustVisitor: DustVisitorV1 = {
        socketId: socketId,
        name: joinVisitorName.trim() || "DUST Monitor Page",
        connectedAt: Date.now(),
      };
      sock.emit("missionJoin", missionId, dustVisitor, (response) => {
        setJoinResponseMessage(`${response.status}: ${response.message}`);
      });
      // Populate the debug table now that we have an authenticated socket.
      sock.emit("getDebugInfo", (data) => setDebugInfo(data));
    });

    sock.on("posEntriesUpdate", (payload) => {
      setLastPosEntriesUpdate(payload);
    });

    sock.onAny((event, ...args) => {
      console.log("[dust socket] received event:", event, args);
    });

    sock.on("connect_error", (err) => {
      console.warn("[dust socket] connect_error:", err.message);
      setDustConnectionStatus("failed");
    });

    sock.on("disconnect", (reason) => {
      console.log("[dust socket] disconnected:", reason);
      setDustConnectionStatus("disconnected");
    });

    sock.connect();
    setDustConnectionStatus("connecting");
  };

  const disconnectDustSocket = () => {
    if (dustSocket.current) {
      dustSocket.current.removeAllListeners();
      dustSocket.current.disconnect();
      dustSocket.current = null;
      setDustConnectionStatus("disconnected");
      setDustSocketId(null);
      // Debug info came from the dust socket — clear it when we disconnect.
      setDebugInfo(null);
      setJoinResponseMessage(null);
      setLastPosEntriesUpdate(null);
    }
  };

  const isDustConnected = dustConnectionStatus === "connected";

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>DUST Monitor</h1>
        <p style={{ color: "#94a3b8", marginTop: "-8px", fontSize: "0.9rem" }}>
          Current DUST traffic on <code>/api/socket</code> namespace <code>/dust</code>.
        </p>

        {/* ── Inspector Socket Status ───────────────────────────────────── */}
        <section className={adminCommon.section}>
          <div className={adminCommon.infoItem}>
            <div>
              <FontAwesomeIcon icon={faPlug} style={{ color: "#94a3b8" }} />
              <span className={adminCommon.infoLabel}> Inspector Socket Status </span>
              <span
                className={`${adminCommon.infoValue} ${
                  inspectorConnectionStatus === "connected"
                    ? adminCommon.statusConnected
                    : inspectorConnectionStatus === "connecting"
                      ? adminCommon.statusConnecting
                      : adminCommon.statusDisconnected
                }`}
              >
                {inspectorConnectionStatus}
              </span>
            </div>
            <div>
              <span className={adminCommon.infoLabel}>Last update: </span>
              <span className={adminCommon.infoValue}>
                {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "—"}
              </span>
            </div>
          </div>
        </section>

        {/* ── DUST Mission Visitors ──────────────────────────────────────── */}
        <section className={adminCommon.section}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2 style={{ margin: 0 }}>DUST Visitors</h2>
            <button
              className={adminCommon.button}
              onClick={refreshDebugInfo}
              disabled={!isDustConnected}
              title={
                isDustConnected ? "Refresh" : "Connect to the dust namespace to enable refresh"
              }
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
          </div>
          <div className={adminCommon.details}>
            {!debugInfo?.visitors || Object.keys(debugInfo.visitors).length === 0 ? (
              <div className={adminCommon.emptyState}>
                {isDustConnected
                  ? "No DUST visitors connected."
                  : "Connect via 'Connect & Join' below to load debug info."}
              </div>
            ) : (
              <PrintDustVisitors visitors={debugInfo.visitors} missionNames={missionNames} />
            )}
          </div>
        </section>

        {/* ── Automerge Listeners ──────────────────────────────────────── */}
        <section className={adminCommon.section}>
          <h2>Automerge Listeners</h2>
          <div className={adminCommon.details}>
            {!debugInfo?.docListenerMissionIds.length ? (
              <div className={adminCommon.emptyState}>No active listeners.</div>
            ) : (
              <table className={adminCommon.table}>
                <thead>
                  <tr>
                    <th>Mission With Active Doc Listeners</th>
                  </tr>
                </thead>
                <tbody>
                  {debugInfo.docListenerMissionIds.map((missionId) => (
                    <tr key={missionId}>
                      <td>{missionNames.get(missionId) ?? missionId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── Received Events (compact grid) ──────────────────────────── */}
        <section className={adminCommon.section}>
          <h2>Received Events</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "12px",
              marginTop: "12px",
            }}
          >
            {/* posEntriesUpdate */}
            <EmitCard title="posEntriesUpdate" fullWidth>
              {!lastPosEntriesUpdate ? (
                <div className={adminCommon.emptyState}>
                  {isDustConnected
                    ? "No posEntriesUpdate received yet. Add/edit/delete a crew position on a running rex for the joined mission."
                    : "Connect via 'Connect & Join' below to receive posEntriesUpdate events."}
                </div>
              ) : (
                <PrintPosEntriesUpdate update={lastPosEntriesUpdate} />
              )}
            </EmitCard>
          </div>
        </section>

        {/* ── Emit sections (compact grid) ─────────────────────────────── */}
        <section className={adminCommon.section}>
          <h2>Emit Events</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "12px",
              marginTop: "12px",
            }}
          >
            {/* missionJoin */}
            <EmitCard title="missionJoin">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.85em" }}>Status:</span>
                <span
                  className={`${adminCommon.infoValue} ${
                    dustConnectionStatus === "connected"
                      ? adminCommon.statusConnected
                      : dustConnectionStatus === "connecting"
                        ? adminCommon.statusConnecting
                        : adminCommon.statusDisconnected
                  }`}
                  style={{ fontSize: "0.85em" }}
                >
                  {dustConnectionStatus}
                </span>
              </div>
              {dustSocketId && (
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.8em" }}>Visitor Socket ID:</span>
                  <span
                    style={{
                      color: "#cbd5e1",
                      fontSize: "0.8em",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {dustSocketId}
                  </span>
                </div>
              )}
              {joinResponseMessage && (
                <div style={{ color: "#cbd5e1", fontSize: "0.8em" }}>{joinResponseMessage}</div>
              )}
              <input
                className={adminCommon.formInput}
                type="password"
                value={dustToken}
                onChange={(e) => setDustToken(e.target.value)}
                placeholder="DUST Token"
                style={wideInput}
              />
              <input
                className={adminCommon.formInput}
                type="number"
                value={joinMissionId}
                onChange={(e) => setJoinMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                value={joinVisitorName}
                onChange={(e) => setJoinVisitorName(e.target.value)}
                placeholder="Visitor Name"
                style={wideInput}
              />
              <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
                <button
                  className={adminCommon.buttonPrimary}
                  onClick={connectAndJoin}
                  disabled={
                    !dustToken.trim() ||
                    !joinMissionId ||
                    dustConnectionStatus === "connecting" ||
                    isDustConnected
                  }
                >
                  Connect &amp; Join
                </button>
                <button
                  className={adminCommon.buttonDanger}
                  onClick={disconnectDustSocket}
                  disabled={dustConnectionStatus === "disconnected"}
                >
                  Disconnect
                </button>
              </div>
            </EmitCard>
          </div>
        </section>
      </div>
    </main>
  );
};

// ─── DUST Mission Visitors table ───────────────────────────────────────────────

const PrintDustVisitors: FunctionComponent<{
  visitors: DustDebugInfo["visitors"];
  missionNames: Map<number, string>;
}> = ({ visitors, missionNames }) => {
  const rows = Object.entries(visitors)
    .sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([missionId, visitorList]) => {
      const missionIdNum = Number(missionId);
      const missionLabel = missionNames.get(missionIdNum) ?? `Mission ${missionId}`;
      return (visitorList ?? []).map((visitor) => ({ missionLabel, visitor }));
    });

  if (!rows.length)
    return <div className={adminCommon.emptyState}>No DUST visitors connected.</div>;

  return (
    <table className={adminCommon.table}>
      <thead>
        <tr>
          <th>Mission</th>
          <th>Name</th>
          <th>Socket ID</th>
          <th>Connected At</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ missionLabel, visitor }) => (
          <tr key={visitor.socketId || "undefined"}>
            <td>{missionLabel}</td>
            <td>{visitor.name}</td>
            <td>{visitor.socketId}</td>
            <td>{new Date(visitor.connectedAt).toUTCString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// ─── posEntriesUpdate payload table ─────────────────────────────────────────────

const PrintPosEntriesUpdate: FunctionComponent<{
  update: DustPosEntriesUpdate;
}> = ({ update }) => (
  <>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: "4px 16px",
        fontSize: "0.85em",
        color: "#cbd5e1",
        marginBottom: "10px",
      }}
    >
      <div>
        <span style={{ color: "#94a3b8" }}>Mission: </span>
        {update.missionName} ({update.missionId})
      </div>
      <div>
        <span style={{ color: "#94a3b8" }}>Rex: </span>
        {update.rexName} ({update.rexUuid})
      </div>
      <div>
        <span style={{ color: "#94a3b8" }}>Eva: </span>
        {update.evaName} ({update.evaUuid})
      </div>
    </div>
    {update.posEntries.length === 0 ? (
      <div className={adminCommon.emptyState}>No crew positions in this update.</div>
    ) : (
      <table className={adminCommon.table}>
        <thead>
          <tr>
            <th>Uuid</th>
            <th>Pos Type(s)</th>
            <th>Pos Source</th>
            <th>Location</th>
            <th>Pet Seconds</th>
            <th>Updated At</th>
          </tr>
        </thead>
        <tbody>
          {update.posEntries.map((entry) => (
            <tr key={entry.uuid}>
              <td>{entry.uuid}</td>
              <td>{entry.posTypes.join(", ")}</td>
              <td>{entry.posSource}</td>
              <td>
                {entry.latlng?.lat?.toFixed(5)}, {entry.latlng?.lng?.toFixed(5)}
              </td>
              <td>{entry.petSeconds}</td>
              <td>{new Date(entry.updatedAt).toUTCString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </>
);

export default DustV1;
