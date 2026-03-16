import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import adminStyles from "components/admin/admin.module.css";
import React from "react";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { faCaretDown, faCaretRight, faPen, faEye, faPlug } from "@fortawesome/free-solid-svg-icons";
import uniq from "lodash/uniq";
import type { Socket } from "socket.io-client";
import { createSocket } from "utils/socketStuff";

const ServerSocketStatus: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  //on load check login
  useEffect(() => {
    (async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data;
        if (!user.isSuperAdmin) {
          navigate("/"); // Redirect to homepage
        }
      } else {
        navigate("/");
      }

      // connect to the inspector socket room
      if (!socket.current || (socket.current && !socket.current.connected)) {
        socket.current = createSocket(window.location.origin);
      }

      socket.current.on("connect", () => {
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

  const handleBack = () => {
    navigate("/admin");
  };

  return (
    <>
      <div className={adminStyles.pageStyle}>
        <div className={adminStyles.header}>
          <Header />
        </div>
        <div className={adminStyles.bodyContent}>
          <div className={adminStyles.missionBack}>
            <FontAwesomeIcon icon={faArrowAltCircleLeft} size="xl" onClick={handleBack} />
          </div>
          <h2>Visitor Connections</h2>
          <div>Connection Status: {connectionStatus}</div>
          <div>Last Updated At: {lastUpdatedAt}</div>
          {!serverSocketStatus?.visitorsData?.length ? (
            <p>No visitors connected.</p>
          ) : (
            <div>
              <p>{serverSocketStatus.visitorsData.length} visitors connected</p>
              <PrintUserLists visitorData={serverSocketStatus?.visitorsData} />
            </div>
          )}

          <h2>Last Edit Events</h2>
          {!serverSocketStatus?.lastEditEvents ||
          Object.keys(serverSocketStatus.lastEditEvents).length === 0 ? (
            <p>No edit events recorded.</p>
          ) : (
            <PrintEditEvents
              lastEditEvents={serverSocketStatus.lastEditEvents}
              visitorsData={serverSocketStatus.visitorsData}
            />
          )}
        </div>
      </div>
    </>
  );
};

const PrintUserLists: FunctionComponent<{
  visitorData: VisitorData[];
}> = ({ visitorData }) => {
  // Get unique missionIds and sort them
  const missionIds = uniq(visitorData.map((visitor) => visitor.missionId)).sort((a, b) => a - b);

  // Track which missions are expanded - initialize all to expanded
  const [expandedMissions, setExpandedMissions] = useState<Record<number, boolean>>({});

  useEffect(() => {
    // Initialize expandedMissions state when visitorData changes
    const initialState: Record<number, boolean> = {};
    const missionIds = uniq(visitorData.map((visitor) => visitor.missionId));
    missionIds.forEach((missionId) => {
      initialState[missionId] = true; // Set all missions to expanded by default
    });
    setExpandedMissions(initialState);
  }, [visitorData]);

  const toggleMission = (missionId: number) => {
    setExpandedMissions((prev) => ({
      ...prev,
      [missionId]: !prev[missionId],
    }));
  };

  return (
    <div>
      {missionIds.map((missionId) => {
        // Separate filtered users into editors and viewers
        const missionVisitorData = visitorData.filter((visitor) => visitor.missionId === missionId);

        const missionEditorData = missionVisitorData.filter((v) => v.permission === "editor");
        const missionViewerData = missionVisitorData.filter((v) => v.permission === "viewer");

        return (
          <div key={missionId}>
            <div
              onClick={() => toggleMission(missionId)}
              style={{
                cursor: "pointer",
                marginTop: "10px",
                userSelect: "none",
              }}
            >
              <h3>
                {expandedMissions[missionId] ? (
                  <FontAwesomeIcon icon={faCaretDown} size="lg" style={{ paddingRight: 5 }} />
                ) : (
                  <FontAwesomeIcon icon={faCaretRight} size="lg" style={{ paddingRight: 5 }} />
                )}
                MissionId {missionId}: ({missionVisitorData.length}{" "}
                <FontAwesomeIcon icon={faPlug} />)
              </h3>
            </div>
            {expandedMissions[missionId] && (
              <div style={{ paddingLeft: "40px" }}>
                {missionEditorData.length > 0 && (
                  <PrintUsers
                    missionId={missionId}
                    visitorData={missionEditorData}
                    permission="Editor"
                  />
                )}
                {missionViewerData.length > 0 && (
                  <PrintUsers
                    missionId={missionId}
                    visitorData={missionViewerData}
                    permission="Viewer"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const PrintUsers: FunctionComponent<{
  missionId: number;
  visitorData: VisitorData[];
  permission: "Editor" | "Viewer";
}> = ({ missionId, visitorData, permission }) => {
  const [showUsers, setShowUsers] = useState<boolean>(true);
  // Get sorted unique users in this mission
  const launchpadUsers = visitorData.map((visitor) => visitor.launchpadUser);
  const uniqueUsers = launchpadUsers.filter(
    (user, index) => launchpadUsers.findIndex((visitor) => visitor?.uupic === user?.uupic) === index
  );

  uniqueUsers.sort((a, b) => {
    const sa = a?.surname || "";
    const sb = b?.surname || "";
    return sa.localeCompare(sb);
  });

  return (
    <div>
      <div
        onClick={() => setShowUsers(!showUsers)}
        style={{
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <h4>
          {showUsers ? (
            <FontAwesomeIcon icon={faCaretDown} size="lg" style={{ paddingRight: 5 }} />
          ) : (
            <FontAwesomeIcon icon={faCaretRight} size="lg" style={{ paddingRight: 5 }} />
          )}
          {permission}s: ({visitorData.length}{" "}
          <FontAwesomeIcon icon={permission === "Editor" ? faPen : faEye} />)
        </h4>
      </div>
      {showUsers && (
        <ul>
          {uniqueUsers.map((user) => {
            const allVisitorRecords = visitorData.filter(
              (visitor) => visitor.launchpadUser?.uupic === user?.uupic
            );
            const displayName = user?.display_name || `${user?.surname}, ${user?.givenname}`;
            return (
              <li key={`${missionId}-${user?.uupic}`}>
                ({allVisitorRecords.length}) {displayName}
                {allVisitorRecords.map((record, index) => {
                  return (
                    <div key={`${record.socketId}-${index}`}>
                      {index > 0 ? <br /> : ""}
                      <div style={{ paddingLeft: "20px" }} key={`${record.socketId}-${index}`}>
                        Permission:
                        <span
                          style={{
                            color: record.permission === "editor" ? "orangered" : "inherit",
                          }}
                        >
                          {` ${record.permission}`}
                        </span>
                        <br />
                        App User: {record.appUser.username || "N/A"} <br />
                        Version: {record.appVersion.version} - {record.appVersion.gitCommit} <br />
                        Connected At: {new Date(record.connectedAt).toUTCString()}
                      </div>
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const PrintEditEvents: FunctionComponent<{
  lastEditEvents: EditEvents;
  visitorsData: VisitorData[];
}> = ({ lastEditEvents, visitorsData }) => {
  const entries = Object.entries(lastEditEvents)
    .map(([missionId, event]) => ({ missionId: Number(missionId), event }))
    .sort((a, b) => a.missionId - b.missionId);

  return (
    <ul>
      {entries.map(({ missionId, event }) => {
        const visitor = visitorsData?.find((v) => v.socketId === event.socketId);
        const user = visitor?.launchpadUser;
        const displayName = user
          ? user.display_name || `${user.surname}, ${user.givenname}`
          : event.socketId;
        return (
          <li key={missionId}>
            MissionId {missionId}: [{event.type}] {new Date(event.datestamp).toUTCString()} —{" "}
            {displayName}
          </li>
        );
      })}
    </ul>
  );
};

export default ServerSocketStatus;
