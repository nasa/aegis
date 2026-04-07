import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import React from "react";
import type { Socket } from "socket.io-client";
import { createSocket } from "utils/socketStuff";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlug } from "@fortawesome/free-solid-svg-icons";
import adminCommon from "./adminCommon.module.css";

const Emss: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);
  const [isEmssApiEnabled, setIsEmssApiEnabled] = useState<boolean>(null);
  const [rexUuid, setRexUuid] = useState<string>("");
  const [clearProperties, setClearProperties] = useState({
    maestroControlled: false,
    maestroEventId: false,
    maestroEventUrl: false,
    maestroActivityPropertiesByRefUuid: false,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  //on load check login
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data;
        if (!user.isSuperAdmin) {
          navigate("/"); //Redirect to homepage
        }
      } else {
        navigate("/");
      }
      // Fetch initial EMSS API status
      const emssRes = await fetch(`/api/v1/emss/enableEmssApi`);
      const emssData = await emssRes.json();
      setIsEmssApiEnabled(emssData.data);

      // Create a socket connection to the server.
      // On handshake, the server will generate an socket id for the client
      if (!socket.current || (socket.current && !socket.current.connected)) {
        socket.current = createSocket(window.location.origin);
      }

      socket.current.on("connect", () => {
        const aegisAdmin: MaestroVisitor = {
          socketId: socket.current.id,
          name: "AEGIS Admin/EMSS Page",
          connectedAt: Date.now(),
        };
        socket.current.emit("maestroJoin", aegisAdmin);
        socket.current.emit("inspectorJoin");
        setConnectionStatus("connected");
      });

      socket.current.on("disconnect", () => {
        setConnectionStatus("disconnected");
      });

      socket.current.on("inspectorUpdate", (data: ServerSocketStatus) => {
        setServerSocketStatus(data);
        setLastUpdatedAt(new Date().toISOString());
      });

      return () => {
        socket.current.off("connect");
        socket.current.off("inspectorUpdate");
        socket.current.disconnect();
      };
    })();
  }, [navigate]);

  const toggleEmssApi = async () => {
    try {
      if (isEmssApiEnabled) {
        const response = confirm("Are you sure you want to turn off the EMSS API?");
        if (!response) return;
      }
      await fetch(`/api/v1/emss/enableEmssApi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enable: !isEmssApiEnabled }),
      });
      // Fetch updated status
      const emssRes = await fetch(`/api/v1/emss/enableEmssApi`);
      setIsEmssApiEnabled((await emssRes.json()).data);
    } catch (error) {
      console.error("Error toggling EMSS API status:", error);
    }
  };

  const postRexControl = async () => {
    try {
      await fetch(`/api/v1/emss/rexControl`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rexUuid,
          maestroControlled: clearProperties.maestroControlled ? false : undefined,
          maestroEventId: clearProperties.maestroEventId ? null : undefined,
          maestroEventUrl: clearProperties.maestroEventUrl ? null : undefined,
          maestroActivityPropertiesByRefUuid: clearProperties.maestroActivityPropertiesByRefUuid
            ? null
            : undefined,
        }),
      });
    } catch (error) {
      console.error("Error clearing Rex properties:", error);
    }
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>EMSS / Maestro</h1>

        <section className={adminCommon.section}>
          <div className={adminCommon.infoItem}>
            <div>
              <FontAwesomeIcon icon={faPlug} style={{ color: "#94a3b8" }} />
              <span className={adminCommon.infoLabel}> Socket Status </span>
              <span
                className={`${adminCommon.infoValue} ${
                  connectionStatus === "connected"
                    ? adminCommon.statusConnected
                    : connectionStatus === "connecting"
                      ? adminCommon.statusConnecting
                      : adminCommon.statusDisconnected
                }`}
              >
                {connectionStatus}
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

        <section className={adminCommon.section}>
          <h2>EMSS API Controls</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.definitionList}>
              <div className={adminCommon.definitionRow}>
                <dt>EMSS API Enabled</dt>
                <dd>
                  <span
                    className={
                      isEmssApiEnabled
                        ? adminCommon.statusConnected
                        : adminCommon.statusDisconnected
                    }
                  >
                    {isEmssApiEnabled ? "Yes" : "No"}
                  </span>
                </dd>
              </div>
            </div>
            <p className={adminCommon.descriptionText}>
              Disabling the EMSS API will block the EMSS Token causing any connections validating
              via the token to be rejected.
            </p>
            <div className={adminCommon.formActions}>
              <button
                className={isEmssApiEnabled ? adminCommon.buttonDanger : adminCommon.buttonSuccess}
                onClick={toggleEmssApi}
              >
                {isEmssApiEnabled ? "Turn Off" : "Turn On"}
              </button>
            </div>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2>Clear REX Properties</h2>
          <div className={adminCommon.details}>
            <div className={adminCommon.definitionList}>
              <div className={adminCommon.definitionRow}>
                <dt>Rex UUID</dt>
                <dd>
                  <input
                    className={adminCommon.formInput}
                    type="text"
                    value={rexUuid}
                    onChange={(e) => setRexUuid(e.target.value)}
                    placeholder="Enter Rex UUID"
                  />
                </dd>
              </div>
            </div>
            <div className={adminCommon.checkboxGroup}>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  checked={clearProperties.maestroControlled}
                  onChange={(e) =>
                    setClearProperties({
                      ...clearProperties,
                      maestroControlled: e.target.checked,
                    })
                  }
                />
                Maestro Controlled
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  checked={clearProperties.maestroEventId}
                  onChange={(e) =>
                    setClearProperties({ ...clearProperties, maestroEventId: e.target.checked })
                  }
                />
                Maestro Event ID
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  checked={clearProperties.maestroEventUrl}
                  onChange={(e) =>
                    setClearProperties({ ...clearProperties, maestroEventUrl: e.target.checked })
                  }
                />
                Maestro Event URL
              </label>
              <label className={adminCommon.checkboxItem}>
                <input
                  type="checkbox"
                  checked={clearProperties.maestroActivityPropertiesByRefUuid}
                  onChange={(e) =>
                    setClearProperties({
                      ...clearProperties,
                      maestroActivityPropertiesByRefUuid: e.target.checked,
                    })
                  }
                />
                Maestro Activity Properties By Ref UUID
              </label>
            </div>
            <div className={adminCommon.formActions}>
              <button className={adminCommon.buttonPrimary} onClick={postRexControl}>
                Send
              </button>
            </div>
          </div>
        </section>

        <section className={adminCommon.section}>
          <h2>Maestro Connections</h2>
          <div className={adminCommon.details}>
            <p className={adminCommon.descriptionText}>
              This page is also connected to the Maestro socket room. Open browser console to
              monitor socket messages on this room.
            </p>
            {!serverSocketStatus?.maestroVisitors?.length ? (
              <div className={adminCommon.emptyState}>No visitors in the Maestro socket room.</div>
            ) : (
              <table className={adminCommon.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Connected At</th>
                  </tr>
                </thead>
                <tbody>
                  {serverSocketStatus.maestroVisitors.map((visitor) => (
                    <tr key={visitor.socketId || "undefined"}>
                      <td>{visitor.name}</td>
                      <td>{new Date(visitor.connectedAt).toUTCString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default Emss;
