import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { getMissionHomepageItems } from "http-client/mission";
import React from "react";
import uniq from "lodash/uniq";
import type { Socket } from "socket.io-client";
import { createClientSocket } from "utils/clientSocketHelpers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlug,
  faUsers,
  faPen,
  faEye,
  faCaretRight,
  faCaretDown,
} from "@fortawesome/free-solid-svg-icons";
import adminCommon from "./adminCommon.module.css";

const ServerSocketStatus: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const socket = useRef<Socket<ServerToClientEvents, ClientToServerEvents>>(null);
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [missionNames, setMissionNames] = useState<Map<number, string>>(new Map());

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

      const missionsRes = await getMissionHomepageItems();
      if (missionsRes.status === "success" && missionsRes.data) {
        const nameMap = new Map<number, string>();
        missionsRes.data.forEach((m) => nameMap.set(m.id, m.name));
        setMissionNames(nameMap);
      }

      // connect to the inspector socket room
      if (!socket.current || (socket.current && !socket.current.connected)) {
        socket.current = createClientSocket(window.location.origin);
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

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Visitor Connections</h1>

        <section className={adminCommon.section}>
          <div className={adminCommon.infoItem}>
            <div>
              <FontAwesomeIcon icon={faPlug} className={adminCommon.mutedIcon} />
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

        {!serverSocketStatus?.visitorsData?.length ? (
          <div className={adminCommon.emptyState}>No visitors connected.</div>
        ) : (
          <PrintUserLists
            visitorData={serverSocketStatus.visitorsData}
            missionNames={missionNames}
          />
        )}

        <section className={adminCommon.section}>
          <h2>Last Edit Events</h2>
          <div className={adminCommon.details}>
            {!serverSocketStatus?.lastEditEvents ||
            Object.keys(serverSocketStatus.lastEditEvents).length === 0 ? (
              <div className={adminCommon.emptyState}>No edit events recorded.</div>
            ) : (
              <PrintEditEvents
                lastEditEvents={serverSocketStatus.lastEditEvents}
                visitorsData={serverSocketStatus.visitorsData}
                missionNames={missionNames}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

const PrintUserLists: FunctionComponent<{
  visitorData: VisitorData[];
  missionNames: Map<number, string>;
}> = ({ visitorData, missionNames }) => {
  const missionIds = uniq(visitorData.map((visitor) => visitor.missionId)).sort((a, b) => a - b);

  const [expandedMissions, setExpandedMissions] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const initialState: Record<number, boolean> = {};
    const missionIds = uniq(visitorData.map((visitor) => visitor.missionId));
    missionIds.forEach((missionId) => {
      initialState[missionId] = true;
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
    <>
      {missionIds.map((missionId) => {
        const missionVisitorData = visitorData.filter((visitor) => visitor.missionId === missionId);
        const missionEditorData = missionVisitorData.filter((v) => v.permission === "editor");
        const missionViewerData = missionVisitorData.filter((v) => v.permission === "viewer");

        return (
          <section key={missionId} className={adminCommon.section}>
            <div className={adminCommon.collapsibleHeader} onClick={() => toggleMission(missionId)}>
              <span className={adminCommon.collapsibleIcon}>
                <FontAwesomeIcon icon={expandedMissions[missionId] ? faCaretDown : faCaretRight} />
              </span>
              <h2 className={adminCommon.sectionHeading}>
                <FontAwesomeIcon icon={faUsers} className={adminCommon.mutedIcon} />
                {missionNames.get(missionId) ?? `Mission ${missionId}`}
                <span className={adminCommon.badgeSuccess}>
                  {missionVisitorData.length} connection
                  {missionVisitorData.length !== 1 ? "s" : ""}
                </span>
              </h2>
            </div>
            {expandedMissions[missionId] && (
              <div className={adminCommon.details}>
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
          </section>
        );
      })}
    </>
  );
};

const PrintUsers: FunctionComponent<{
  missionId: number;
  visitorData: VisitorData[];
  permission: "Editor" | "Viewer";
}> = ({ missionId, visitorData, permission }) => {
  const [showUsers, setShowUsers] = useState<boolean>(true);
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
    <div style={{ marginBottom: "12px" }}>
      <div className={adminCommon.collapsibleHeader} onClick={() => setShowUsers(!showUsers)}>
        <span>
          <FontAwesomeIcon
            icon={showUsers ? faCaretDown : faCaretRight}
            className={adminCommon.mutedIcon}
          />
        </span>
        <FontAwesomeIcon
          icon={permission === "Editor" ? faPen : faEye}
          className={adminCommon.mutedIcon}
        />
        <span>
          {permission}s ({visitorData.length})
        </span>
      </div>
      {showUsers && (
        <table className={adminCommon.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Sessions</th>
              <th>App User</th>
              <th>IP Address</th>
              <th>Version</th>
              <th>Connected At</th>
            </tr>
          </thead>
          <tbody>
            {uniqueUsers.map((user) => {
              const allVisitorRecords = visitorData.filter(
                (visitor) => visitor.launchpadUser?.uupic === user?.uupic
              );
              const displayName = user?.display_name || `${user?.surname}, ${user?.givenname}`;
              return allVisitorRecords.map((record, index) => (
                <tr key={`${missionId}-${record.socketId}-${index}`}>
                  {index === 0 ? <td rowSpan={allVisitorRecords.length}>{displayName}</td> : null}
                  <td>
                    <span
                      className={
                        record.permission === "editor"
                          ? adminCommon.statusDisconnected
                          : adminCommon.statusConnected
                      }
                    >
                      {record.permission}
                    </span>
                  </td>
                  <td>{record.appUser.username || "N/A"}</td>
                  <td>{record.launchpadUser?.ip_address || "N/A"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em" }}>
                    {record.clientAppVersion.version} – {record.clientAppVersion.gitCommit}
                  </td>
                  <td>{new Date(record.connectedAt).toUTCString()}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

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

export default ServerSocketStatus;
