import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import adminStyles from "components/admin/admin.module.css";
import React from "react";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import type { Socket } from "socket.io-client";
import { createSocket } from "utils/socketStuff";
import { faArrowRotateRight } from "@fortawesome/free-solid-svg-icons";

const Emss: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);
  const [isEmssApiEnabled, setIsEmssApiEnabled] = useState<boolean>(null);
  const [rexUuid, setRexUuid] = useState<string>("");
  const [clearProperties, setClearProperties] = useState({
    maestroControlled: false,
    maestroEventId: false,
    maestroEventUrl: false,
    maestroActivityPropertiesByRefUuid: false,
  });

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
      const res = await fetch(`/api/v1/socket/serverSocketStatus`);
      setServerSocketStatus(await res.json());

      // Fetch initial EMSS API status
      const emssRes = await fetch(`/api/v1/emss/enableEmssApi`);
      const emssData = await emssRes.json();
      setIsEmssApiEnabled(emssData.data);
    })();
  }, [navigate]);

  //socket connection
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);

  //Handle socketio events
  useEffect(() => {
    // Create a socket connection to the server.
    // On handshake, the server will generate an socket id for the client
    if (!socket.current || (socket.current && !socket.current.connected)) {
      socket.current = createSocket(window.location.origin);
    }

    socket.current.on("connect", () => {
      const aegisAdmin: MaestroVisitor = {
        socketId: socket.current.id,
        name: "AEGIS Admin Page",
        connectedAt: Date.now(),
      };
      socket.current.emit("maestroJoin", aegisAdmin);
    });

    return () => {
      socket.current.off("connect");
      socket.current.disconnect();
    };
  }, [socket]);

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
    <>
      <div className={adminStyles.pageStyle}>
        <div className={adminStyles.header}>
          <Header />
        </div>
        <div className={adminStyles.bodyContent}>
          <div className={adminStyles.missionBack}>
            <FontAwesomeIcon
              icon={faArrowAltCircleLeft}
              size="xl"
              onClick={() => {
                navigate("/admin");
              }}
            />
          </div>
          <h2>API Endpoint Controls</h2>
          <strong>EMSS API Enabled:</strong> {isEmssApiEnabled ? "Yes" : "No"}
          <button onClick={toggleEmssApi} style={{ marginLeft: "10px" }}>
            {isEmssApiEnabled ? "Turn Off" : "Turn On"}
          </button>
          <br />
          Disabling the EMSS API will block the EMSS Token causing any connections validating via
          the token to be rejected.
          <h4>Clear REX properties</h4>
          <div style={{ paddingLeft: "30px" }}>
            <div>
              <label>
                Rex UUID:
                <input
                  type="text"
                  value={rexUuid}
                  onChange={(e) => setRexUuid(e.target.value)}
                  style={{ marginLeft: "10px", width: "300px" }}
                />
              </label>
              <br />
              <label>
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
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={clearProperties.maestroEventId}
                  onChange={(e) =>
                    setClearProperties({ ...clearProperties, maestroEventId: e.target.checked })
                  }
                />
                Maestro Event ID
              </label>
              <br />
              <label>
                <input
                  type="checkbox"
                  checked={clearProperties.maestroEventUrl}
                  onChange={(e) =>
                    setClearProperties({ ...clearProperties, maestroEventUrl: e.target.checked })
                  }
                />
                Maestro Event URL
              </label>
              <br />
              <label>
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
            <button onClick={postRexControl} style={{ marginTop: "10px" }}>
              Send
            </button>
          </div>
          <div className={adminStyles.refreshTitle}>
            <h2>Maestro Connections</h2>
            <FontAwesomeIcon
              icon={faArrowRotateRight}
              onClick={() => {
                (async () => {
                  const res = await fetch(`/api/v1/socket/serverSocketStatus`);
                  setServerSocketStatus(await res.json());
                })();
              }}
              style={{ cursor: "pointer" }}
            />
          </div>
          This page is connected to the Maestro socket room. Open browser console to monitor socket
          messages on this room.
          {!serverSocketStatus?.maestroVisitors?.length ? (
            <p>No visitors in the Maestro socket room.</p>
          ) : (
            <ul>
              {serverSocketStatus.maestroVisitors.map((visitor) => (
                <li key={visitor.socketId || "undefined"}>
                  <strong>{visitor.name}</strong> (connected at{" "}
                  {new Date(visitor.connectedAt).toUTCString()})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default Emss;
