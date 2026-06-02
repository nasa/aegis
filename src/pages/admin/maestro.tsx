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

// ─── Maestro namespace connection ─────────────────────────────────────────────

const createMaestroSocket = (
  serverURL: string,
  emssToken: string
): Socket<MaestroServerToClientEvents, MaestroClientToServerEvents> => {
  return io(`${serverURL}/maestro`, {
    transports: ["websocket"],
    upgrade: true,
    path: "/api/v1/socketio",
    auth: { token: emssToken },
    autoConnect: false,
  }) as unknown as Socket<MaestroServerToClientEvents, MaestroClientToServerEvents>;
};

const parseMissionIdFromRoomName = (roomName: string): number | null => {
  const match = roomName.match(/^maestro(\d+)$/);
  return match ? Number(match[1]) : null;
};

type MaestroDebugInfo = {
  docListenerRooms: string[];
  evaSubscriptions: { [missionId: number]: string[] };
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

// ─── Main page component ───────────────────────────────────────────────────────

const Maestro: React.FunctionComponent = () => {
  const navigate = useNavigate();

  // Inspector socket (default namespace)
  const inspectorSocket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [inspectorConnectionStatus, setInspectorConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);
  const [missionNames, setMissionNames] = useState<Map<number, string>>(new Map());

  // Maestro namespace socket
  const maestroSocket =
    useRef<Socket<MaestroServerToClientEvents, MaestroClientToServerEvents>>(null);
  const [maestroConnectionStatus, setMaestroConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [maestroSocketId, setMaestroSocketId] = useState<string | null>(null);

  // ── Connect + missionJoin form ───────────────────────────────────────────
  const [emssToken, setEmssToken] = useState<string>("");
  const [joinMissionId, setJoinMissionId] = useState<string>("");
  const [joinVisitorName, setJoinVisitorName] = useState<string>("Maestro Monitor Page");

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

  // ── getMission ────────────────────────────────────────────────────────────
  const [getMissionId, setGetMissionId] = useState<string>("");

  // ── getReadableEva ────────────────────────────────────────────────────────
  const [readableEvaMissionId, setReadableEvaMissionId] = useState<string>("");
  const [readableEvaRefUuid, setReadableEvaRefUuid] = useState<string>("");
  const [readableRexUuid, setReadableRexUuid] = useState<string>("");

  // ── getRexesByEvaRef ──────────────────────────────────────────────────────
  const [rexEvaRefUuid, setRexEvaRefUuid] = useState<string>("");

  // ── rexOverwrite ──────────────────────────────────────────────────────────
  const [rexOverwriteJson, setRexOverwriteJson] = useState<string>(
    JSON.stringify({ uuid: "" }, null, 2)
  );
  const [rexOverwriteJsonError, setRexOverwriteJsonError] = useState<string | null>(null);

  // ── Maestro debug info ────────────────────────────────────────────────────
  const [maestroDebugInfo, setMaestroDebugInfo] = useState<MaestroDebugInfo | null>(null);

  const refreshGlobalInfo = () => {
    if (!inspectorSocket.current?.connected) return;
    inspectorSocket.current.emit("getMaestroDebugInfo", (data) => {
      setMaestroDebugInfo(data);
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
        refreshGlobalInfo();
      });

      inspectorSocket.current.on("disconnect", () => {
        setInspectorConnectionStatus("disconnected");
      });

      inspectorSocket.current.on("inspectorUpdate", (data: ServerSocketStatus) => {
        setServerSocketStatus(data);
        setLastUpdatedAt(new Date().toISOString());
        refreshGlobalInfo();
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
      const maestroVisitor: MaestroVisitor = {
        socketId: socketId,
        name: joinVisitorName.trim() || "Maestro Monitor Page",
        connectedAt: Date.now(),
      };
      sock.emit("missionJoin", missionId, maestroVisitor);
    });

    sock.onAny((event, ...args) => {
      console.log("[maestro socket] received event:", event, args);
    });

    sock.on("connect_error", (err) => {
      console.warn("[maestro socket] connect_error:", err.message);
      setMaestroConnectionStatus("failed");
    });

    sock.on("disconnect", (reason) => {
      console.log("[maestro socket] disconnected:", reason);
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

  const emitunsubscribeToEva = () => {
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

  const emitGetMission = () => {
    if (!maestroSocket.current?.connected) return;
    maestroSocket.current.emit("getMission", Number(getMissionId), () => {});
  };

  const emitGetReadableEva = () => {
    if (!maestroSocket.current?.connected) return;
    const params: ReadableEvaParams = {
      missionId: Number(readableEvaMissionId),
      ...(readableEvaRefUuid.trim() && { evaRefUuid: readableEvaRefUuid.trim() }),
      ...(readableRexUuid.trim() && { rexUuid: readableRexUuid.trim() }),
    };
    maestroSocket.current.emit("getReadableEva", params, () => {});
  };

  const emitGetMissions = () => {
    if (!maestroSocket.current?.connected) return;
    maestroSocket.current.emit("getMissions", () => {});
  };

  const emitGetRexesByEvaRef = () => {
    if (!maestroSocket.current?.connected) return;
    maestroSocket.current.emit("getRexesByEvaRef", rexEvaRefUuid.trim(), () => {});
  };

  const emitRexOverwrite = () => {
    if (!maestroSocket.current?.connected) return;
    try {
      const body = JSON.parse(rexOverwriteJson) as RexOverwrite;
      setRexOverwriteJsonError(null);
      maestroSocket.current.emit("rexOverwrite", body, () => {});
    } catch (e) {
      setRexOverwriteJsonError(`Invalid JSON: ${String(e)}`);
    }
  };

  const isMaestroConnected = maestroConnectionStatus === "connected";

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Maestro Monitor</h1>

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

        {/* ── Maestro Mission Visitors ──────────────────────────────────── */}
        <section className={adminCommon.section}>
          <h2>Maestro Visitors</h2>
          <div className={adminCommon.details}>
            {!serverSocketStatus?.maestroMissionVisitors ||
            Object.keys(serverSocketStatus.maestroMissionVisitors).length === 0 ? (
              <div className={adminCommon.emptyState}>No Maestro visitors connected.</div>
            ) : (
              <PrintMaestroMissionVisitors
                maestroMissionVisitors={serverSocketStatus.maestroMissionVisitors}
                missionNames={missionNames}
              />
            )}
          </div>
        </section>

        {/* ── Subscriptions And Automerge Listeners ──────────────────────── */}
        <section className={adminCommon.section}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h2 style={{ margin: 0 }}>Subscriptions And Automerge Listeners</h2>
            <button
              className={adminCommon.button}
              onClick={refreshGlobalInfo}
              disabled={inspectorConnectionStatus !== "connected"}
              title="Refresh"
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
                {!maestroDebugInfo ||
                Object.keys(maestroDebugInfo.evaSubscriptions).length === 0 ? (
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
                      {Object.entries(maestroDebugInfo.evaSubscriptions).map(
                        ([missionId, uuids]) => (
                          <tr key={missionId}>
                            <td>{missionNames.get(Number(missionId)) ?? missionId}</td>
                            <td>{uuids.join(", ")}</td>
                          </tr>
                        )
                      )}
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
                {!maestroDebugInfo?.docListenerRooms.length ? (
                  <div className={adminCommon.emptyState}>No active listeners.</div>
                ) : (
                  <table className={adminCommon.table}>
                    <thead>
                      <tr>
                        <th>Room Name With Active Listeners</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maestroDebugInfo.docListenerRooms.map((room) => (
                        <tr key={room}>
                          <td>{room}</td>
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
                onClick={emitunsubscribeToEva}
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

            {/* getMission */}
            <EmitCard title="getMission">
              <input
                className={adminCommon.formInput}
                type="number"
                value={getMissionId}
                onChange={(e) => setGetMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <button
                className={adminCommon.buttonPrimary}
                onClick={emitGetMission}
                disabled={!isMaestroConnected || !getMissionId}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* getMissions */}
            <EmitCard title="getMissions">
              <button
                className={adminCommon.buttonPrimary}
                onClick={emitGetMissions}
                disabled={!isMaestroConnected}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* getRexesByEvaRef */}
            <EmitCard title="getRexesByEvaRef">
              <input
                className={adminCommon.formInput}
                type="text"
                value={rexEvaRefUuid}
                onChange={(e) => setRexEvaRefUuid(e.target.value)}
                placeholder="EVA RefUuid"
                style={wideInput}
              />
              <button
                className={adminCommon.buttonPrimary}
                onClick={emitGetRexesByEvaRef}
                disabled={!isMaestroConnected || !rexEvaRefUuid}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* getReadableEva */}
            <EmitCard title="getReadableEva">
              <input
                className={adminCommon.formInput}
                type="number"
                value={readableEvaMissionId}
                onChange={(e) => setReadableEvaMissionId(e.target.value)}
                placeholder="Mission ID"
                style={narrowInput}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                value={readableEvaRefUuid}
                onChange={(e) => setReadableEvaRefUuid(e.target.value)}
                placeholder="EVA RefUuid (optional)"
                style={wideInput}
              />
              <input
                className={adminCommon.formInput}
                type="text"
                value={readableRexUuid}
                onChange={(e) => setReadableRexUuid(e.target.value)}
                placeholder="Rex Uuid (optional)"
                style={wideInput}
              />
              <button
                className={adminCommon.buttonPrimary}
                onClick={emitGetReadableEva}
                disabled={!isMaestroConnected || !readableEvaMissionId}
                style={{ marginTop: "auto" }}
              >
                Emit
              </button>
            </EmitCard>

            {/* rexOverwrite */}
            <EmitCard title="rexOverwrite">
              <textarea
                className={adminCommon.formInput}
                rows={4}
                value={rexOverwriteJson}
                onChange={(e) => {
                  setRexOverwriteJson(e.target.value);
                  setRexOverwriteJsonError(null);
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
                {rexOverwriteJsonError && (
                  <p style={{ color: "#f87171", margin: 0, fontSize: "0.85em" }}>
                    {rexOverwriteJsonError}
                  </p>
                )}
                <button
                  className={adminCommon.buttonPrimary}
                  onClick={emitRexOverwrite}
                  disabled={!isMaestroConnected}
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

// ─── Maestro Mission Visitors table ───────────────────────────────────────────

const PrintMaestroMissionVisitors: FunctionComponent<{
  maestroMissionVisitors: { [roomName: string]: MaestroVisitor[] };
  missionNames: Map<number, string>;
}> = ({ maestroMissionVisitors, missionNames }) => {
  const rows = Object.entries(maestroMissionVisitors)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([roomName, visitors]) => {
      const missionId = parseMissionIdFromRoomName(roomName);
      const missionLabel =
        missionId !== null ? (missionNames.get(missionId) ?? `Mission ${missionId}`) : roomName;
      return (visitors ?? []).map((visitor) => ({ missionLabel, visitor }));
    });

  if (!rows.length)
    return <div className={adminCommon.emptyState}>No Maestro visitors connected.</div>;

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

export default Maestro;
