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
import type { MDAU } from "server/maestro/v2/types/mdau";
import type { MaestroVersionDebugInfo } from "server/maestro/v2/types/socketioMaestro";

// ─── Maegistro v2 namespace connection ────────────────────────────────────────
// v2 lives on the new /socket server under the /maestro/v2 namespace.
// Future major versions would use /maestro/v3, /maestro/v4, ... on the same server.

const createMaestroSocket = (
  serverURL: string,
  emssToken: string
): Socket<MaestroServerToClientEventsV2, MaestroClientToServerEventsV2> => {
  return io(`${serverURL}/maestro/v2`, {
    transports: ["websocket"],
    upgrade: true,
    path: "/api/socket",
    auth: { token: emssToken },
    autoConnect: false,
  }) as unknown as Socket<MaestroServerToClientEventsV2, MaestroClientToServerEventsV2>;
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

const MaestroV2: React.FunctionComponent = () => {
  const navigate = useNavigate();

  // Inspector socket (default namespace on the new /socket server).
  const inspectorSocket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [inspectorConnectionStatus, setInspectorConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);
  const [missionNames, setMissionNames] = useState<Map<number, string>>(new Map());

  // Maegistro v2 namespace socket
  const maestroSocket =
    useRef<Socket<MaestroServerToClientEventsV2, MaestroClientToServerEventsV2>>(null);
  const [maestroConnectionStatus, setMaestroConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [maestroSocketId, setMaestroSocketId] = useState<string | null>(null);

  // ── Connect + missionJoin form ───────────────────────────────────────────
  const [emssToken, setEmssToken] = useState<string>("");
  const [joinMissionId, setJoinMissionId] = useState<string>("");
  const [joinVisitorName, setJoinVisitorName] = useState<string>("Maestro V2 Monitor Page");

  // ── missionLeave form ────────────────────────────────────────────────────
  const [leaveMissionId, setLeaveMissionId] = useState<string>("");

  // ── subscribeToEva ────────────────────────────────────────────────────────
  const [subMissionId, setSubMissionId] = useState<string>("");
  const [subEvaUuid, setSubEvaUuid] = useState<string>("");
  const [subRexUuid, setSubRexUuid] = useState<string>("");

  // ── unsubscribeToEva ──────────────────────────────────────────────────────
  const [desubMissionId, setDesubMissionId] = useState<string>("");
  const [desubEvaUuid, setDesubEvaUuid] = useState<string>("");
  const [desubRexUuid, setDesubRexUuid] = useState<string>("");

  // ── getEverything ─────────────────────────────────────────────────────────
  const [everythingMissionId, setEverythingMissionId] = useState<string>("");

  // ── sendMDAU (v2's replacement for v1's rexOverwrite) ────────────────────
  const [sendMdauMissionId, setSendMdauMissionId] = useState<string>("");
  const [sendMdauJson, setSendMdauJson] = useState<string>(
    JSON.stringify({ aegisStations: {} }, null, 2)
  );
  const [sendMdauJsonError, setSendMdauJsonError] = useState<string | null>(null);

  // ── Maegistro v2 debug info (visitors, listeners, subscriptions) ─────────
  // Fetched via the v2 /maestro/v2 namespace's `getDebugInfo` event — requires
  // an EMSS-authenticated maestro socket, i.e. after "Connect & Join" has run.
  const [debugInfo, setDebugInfo] = useState<MaestroVersionDebugInfo | null>(null);

  const refreshDebugInfo = () => {
    if (!maestroSocket.current?.connected) return;
    maestroSocket.current.emit("getDebugInfo", (data) => {
      setDebugInfo(data);
    });
  };

  // ── Auth check + inspector socket setup ──────────────────────────────────
  useEffect(() => {
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

      if (!inspectorSocket.current || !inspectorSocket.current.connected) {
        inspectorSocket.current = createClientSocket(window.location.origin);
      }

      inspectorSocket.current.on("connect", () => {
        inspectorSocket.current.emit("inspectorJoin");
        setInspectorConnectionStatus("connected");
      });

      inspectorSocket.current.on("disconnect", () => {
        setInspectorConnectionStatus("disconnected");
      });

      inspectorSocket.current.on("inspectorUpdate", (data: ServerSocketStatus) => {
        setServerSocketStatus(data);
        setLastUpdatedAt(new Date().toISOString());
      });

      return () => {
        inspectorSocket.current?.off("connect");
        inspectorSocket.current?.off("inspectorUpdate");
        inspectorSocket.current?.disconnect();
      };
    })();
  }, [navigate]);

  // ── Maestro socket lifecycle ──────────────────────────────────────────────

  const connectAndJoin = () => {
    if (!emssToken.trim() || !joinMissionId) return;

    if (maestroSocket.current) {
      maestroSocket.current.removeAllListeners();
      maestroSocket.current.disconnect();
    }

    const sock = createMaestroSocket(window.location.origin, emssToken.trim());
    maestroSocket.current = sock;

    sock.on("connect", () => {
      const socketId = sock.id;
      setMaestroSocketId(socketId ?? null);
      setMaestroConnectionStatus("connected");
      const missionId = Number(joinMissionId);
      const maestroVisitor: MaestroVisitorV2 = {
        socketId: socketId,
        name: joinVisitorName.trim() || "Maestro V2 Monitor Page",
        connectedAt: Date.now(),
      };
      sock.emit("missionJoin", missionId, maestroVisitor);
      // Populate the debug tables now that we have an authenticated socket.
      sock.emit("getDebugInfo", (data) => setDebugInfo(data));
    });

    sock.onAny((event, ...args) => {
      console.log("[maestro v2 socket] received event:", event, args);
    });

    sock.on("connect_error", (err) => {
      console.warn("[maestro v2 socket] connect_error:", err.message);
      setMaestroConnectionStatus("failed");
    });

    sock.on("disconnect", (reason) => {
      console.log("[maestro v2 socket] disconnected:", reason);
      setMaestroConnectionStatus("disconnected");
    });

    sock.connect();
    setMaestroConnectionStatus("connecting");
  };

  const disconnectMaestroSocket = () => {
    if (maestroSocket.current) {
      maestroSocket.current.removeAllListeners();
      maestroSocket.current.disconnect();
      maestroSocket.current = null;
      setMaestroConnectionStatus("disconnected");
      setMaestroSocketId(null);
      // Debug info came from the maestro socket — clear it when we disconnect.
      setDebugInfo(null);
    }
  };

  const emitMissionLeave = () => {
    if (!maestroSocket.current?.connected || !leaveMissionId) return;
    maestroSocket.current.emit("missionLeave", Number(leaveMissionId));
  };

  // ── Emit helpers ──────────────────────────────────────────────────────────

  const emitSubscribeToEva = () => {
    if (!maestroSocket.current?.connected) return;
    maestroSocket.current.emit(
      "subscribeToEva",
      Number(subMissionId),
      subEvaUuid.trim(),
      subRexUuid.trim() || null
    );
  };

  const emitUnsubscribeToEva = () => {
    if (!maestroSocket.current?.connected) return;
    maestroSocket.current.emit(
      "unsubscribeToEva",
      Number(desubMissionId),
      desubEvaUuid.trim(),
      desubRexUuid.trim() || null
    );
  };

  const emitGetEverything = () => {
    if (!maestroSocket.current?.connected) return;
    maestroSocket.current.emit("getEverything", Number(everythingMissionId), () => {});
  };

  const emitSendMdau = () => {
    if (!maestroSocket.current?.connected || !sendMdauMissionId) return;
    try {
      const mdau = JSON.parse(sendMdauJson) as MDAU.MaestroDataAegisUses;
      setSendMdauJsonError(null);
      maestroSocket.current.emit("sendMDAU", Number(sendMdauMissionId), mdau);
    } catch (e) {
      setSendMdauJsonError(`Invalid JSON: ${String(e)}`);
    }
  };

  const isMaestroConnected = maestroConnectionStatus === "connected";

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Maegistro v2 Monitor</h1>
        <p style={{ color: "#94a3b8", marginTop: "-8px", fontSize: "0.9rem" }}>
          Current Maegistro v2 traffic on <code>/socket</code> namespace <code>/maestro/v2</code>.
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

        {/* ── Maegistro v2 Mission Visitors ─────────────────────────────── */}
        <section className={adminCommon.section}>
          <h2>Maegistro v2 Visitors</h2>
          <div className={adminCommon.details}>
            {!debugInfo?.visitors || Object.keys(debugInfo.visitors).length === 0 ? (
              <div className={adminCommon.emptyState}>
                {isMaestroConnected
                  ? "No Maegistro v2 visitors connected."
                  : "Connect via 'Connect & Join' below to load debug info."}
              </div>
            ) : (
              <PrintMaestroVisitors visitors={debugInfo.visitors} missionNames={missionNames} />
            )}
          </div>
        </section>

        {/* ── Subscriptions And Automerge Listeners ──────────────────────── */}
        <section className={adminCommon.section}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2 style={{ margin: 0 }}>Subscriptions And Automerge Listeners</h2>
            <button
              className={adminCommon.button}
              onClick={refreshDebugInfo}
              disabled={!isMaestroConnected}
              title={
                isMaestroConnected
                  ? "Refresh"
                  : "Connect to the v2 maestro namespace to enable refresh"
              }
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
          </div>
          <div className={adminCommon.details}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    color: "#94a3b8",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  EVA Subscriptions
                </p>
                {!debugInfo || Object.keys(debugInfo.evaSubscriptions).length === 0 ? (
                  <div className={adminCommon.emptyState}>No active EVA subscriptions.</div>
                ) : (
                  <table className={adminCommon.table}>
                    <thead>
                      <tr>
                        <th>Mission ID</th>
                        <th>EVA Uuid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(debugInfo.evaSubscriptions).map(([missionId, uuids]) => (
                        <tr key={missionId}>
                          <td>{missionNames.get(Number(missionId)) ?? missionId}</td>
                          <td>{uuids.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    color: "#94a3b8",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  AM Doc Listeners
                </p>
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
            </div>
          </div>
        </section>

        {/* ── Last Edit Events ──────────────────────────────────────────── */}
        <section className={adminCommon.section}>
          <h2>Last Edit Events</h2>
          <div className={adminCommon.details}>
            {!serverSocketStatus?.lastEditEvents ||
            Object.keys(serverSocketStatus.lastEditEvents).length === 0 ? (
              <div className={adminCommon.emptyState}>No edit events recorded.</div>
            ) : (
              <PrintEditEvents
                lastEditEvents={serverSocketStatus.lastEditEvents}
                visitorsData={serverSocketStatus.visitorsData ?? []}
                missionNames={missionNames}
              />
            )}
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
                    maestroConnectionStatus === "connected"
                      ? adminCommon.statusConnected
                      : maestroConnectionStatus === "connecting"
                        ? adminCommon.statusConnecting
                        : adminCommon.statusDisconnected
                  }`}
                  style={{ fontSize: "0.85em" }}
                >
                  {maestroConnectionStatus}
                </span>
              </div>
              {maestroSocketId && (
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.8em" }}>Visitor Socket ID:</span>
                  <span
                    style={{
                      color: "#cbd5e1",
                      fontSize: "0.8em",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {maestroSocketId}
                  </span>
                </div>
              )}
              <input
                className={adminCommon.formInput}
                type="password"
                value={emssToken}
                onChange={(e) => setEmssToken(e.target.value)}
                placeholder="EMSS Token"
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
                    !emssToken.trim() ||
                    !joinMissionId ||
                    maestroConnectionStatus === "connecting" ||
                    isMaestroConnected
                  }
                >
                  Connect &amp; Join
                </button>
                <button
                  className={adminCommon.buttonDanger}
                  onClick={disconnectMaestroSocket}
                  disabled={maestroConnectionStatus === "disconnected"}
                >
                  Disconnect
                </button>
              </div>
            </EmitCard>

            {/* missionLeave */}
            <EmitCard title="missionLeave">
              <input
                className={adminCommon.formInput}
                type="number"
                value={leaveMissionId}
                onChange={(e) => setLeaveMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <button
                className={adminCommon.buttonDanger}
                onClick={emitMissionLeave}
                disabled={!isMaestroConnected || !leaveMissionId}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* subscribeToEva */}
            <EmitCard title="subscribeToEva">
              <input
                className={adminCommon.formInput}
                type="number"
                value={subMissionId}
                onChange={(e) => setSubMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                value={subEvaUuid}
                onChange={(e) => setSubEvaUuid(e.target.value)}
                placeholder="EVA RefUuid"
                style={wideInput}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                value={subRexUuid}
                onChange={(e) => setSubRexUuid(e.target.value)}
                placeholder="Rex Uuid (optional, null if empty)"
                style={wideInput}
              />
              <button
                className={adminCommon.buttonPrimary}
                onClick={emitSubscribeToEva}
                disabled={!isMaestroConnected || !subMissionId || !subEvaUuid}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* unsubscribeToEva */}
            <EmitCard title="unsubscribeToEva">
              <input
                className={adminCommon.formInput}
                type="number"
                value={desubMissionId}
                onChange={(e) => setDesubMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                value={desubEvaUuid}
                onChange={(e) => setDesubEvaUuid(e.target.value)}
                placeholder="EVA RefUuid"
                style={wideInput}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                value={desubRexUuid}
                onChange={(e) => setDesubRexUuid(e.target.value)}
                placeholder="Rex Uuid (optional, null if empty)"
                style={wideInput}
              />
              <button
                className={adminCommon.buttonPrimary}
                onClick={emitUnsubscribeToEva}
                disabled={!isMaestroConnected || !desubMissionId || !desubEvaUuid}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* getEverything */}
            <EmitCard title="getEverything">
              <input
                className={adminCommon.formInput}
                type="number"
                value={everythingMissionId}
                onChange={(e) => setEverythingMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <button
                className={adminCommon.buttonPrimary}
                onClick={emitGetEverything}
                disabled={!isMaestroConnected || !everythingMissionId}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* sendMDAU (v2's replacement for v1's rexOverwrite) */}
            <EmitCard title="sendMDAU">
              <input
                className={adminCommon.formInput}
                type="number"
                value={sendMdauMissionId}
                onChange={(e) => setSendMdauMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <textarea
                className={adminCommon.formInput}
                rows={4}
                value={sendMdauJson}
                onChange={(e) => {
                  setSendMdauJson(e.target.value);
                  setSendMdauJsonError(null);
                }}
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.85em",
                  width: "100%",
                }}
              />
              <div
                style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "6px" }}
              >
                {sendMdauJsonError && (
                  <p style={{ color: "#f87171", margin: 0, fontSize: "0.85em" }}>
                    {sendMdauJsonError}
                  </p>
                )}
                <button
                  className={adminCommon.buttonPrimary}
                  onClick={emitSendMdau}
                  disabled={!isMaestroConnected || !sendMdauMissionId}
                  style={{ width: "fit-content" }}
                >
                  Emit
                </button>
              </div>
            </EmitCard>
          </div>
        </section>
      </div>
    </main>
  );
};

// ─── Maegistro v2 Mission Visitors table ──────────────────────────────────────

const PrintMaestroVisitors: FunctionComponent<{
  visitors: MaestroVersionDebugInfo["visitors"];
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
    return <div className={adminCommon.emptyState}>No Maegistro v2 visitors connected.</div>;

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

// ─── Last Edit Events table ────────────────────────────────────────────────────

const PrintEditEvents: FunctionComponent<{
  lastEditEvents: EditEvents;
  visitorsData: VisitorData[];
  missionNames: Map<number, string>;
}> = ({ lastEditEvents, visitorsData, missionNames }) => {
  const entries = Object.entries(lastEditEvents)
    .map(([missionId, event]) => ({ missionId: Number(missionId), event }))
    .sort((a, b) => a.missionId - b.missionId);

  return (
    <table className={adminCommon.table}>
      <thead>
        <tr>
          <th>Mission</th>
          <th>Type</th>
          <th>Time</th>
          <th>User</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(({ missionId, event }) => {
          const visitor = visitorsData?.find((v) => v.socketId === event.socketId);
          const user = visitor?.launchpadUser;
          const displayName = user
            ? user.display_name || `${user.surname}, ${user.givenname}`
            : event.socketId;
          return (
            <tr key={missionId}>
              <td>{missionNames.get(missionId) ?? missionId}</td>
              <td>{event.type}</td>
              <td>{new Date(event.datestamp).toUTCString()}</td>
              <td>{displayName}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default MaestroV2;
