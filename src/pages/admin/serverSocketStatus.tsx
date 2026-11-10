import AsyncStatus from "components/admin/asyncStatus";
import { useAsyncStatus } from "components/admin/useAsyncStatus";
import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import { getMissionHomepageItems } from "http-client/mission";
import React from "react";
import uniq from "lodash/uniq";
import { getClientSocket, joinInspectorRoom } from "utils/clientSocketHelpers";
import { deepEqual, useAppSelector } from "utils/useAppSelector";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlug,
  faUsers,
  faPen,
  faEye,
  faCaretRight,
  faCaretDown,
  faComputer,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import adminCommon from "./adminCommon.module.css";

const ServerSocketStatus: React.FunctionComponent = () => {
  const loading = useAsyncStatus("Loading missions...");
  const { run: runLoad } = loading;
  const navigate = useNavigate();
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);
  // The app-wide socket stores the server version it receives on connect
  const appVersion = useAppSelector(
    (state) => state.connection.socketStatus.lastStatusFromServer.serverVersion,
    deepEqual
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [missionNames, setMissionNames] = useState<Map<number, string>>(new Map());

  //on load check login
  useEffect(() => {
    let cancelled = false;
    let leaveInspectorRoom: (() => void) | null = null;
    runLoad("Loading missions...", async () => {
      const response = await isLoggedIn();
      if (response.status === "success") {
        const user = response.data;
        if (!user.isSuperAdmin) {
          navigate("/"); // Redirect to homepage
          return;
        }
      } else {
        navigate("/");
        return;
      }

      const missionsRes = await getMissionHomepageItems();
      if (cancelled) return;
      if (missionsRes.status === "success" && missionsRes.data) {
        const nameMap = new Map<number, string>();
        missionsRes.data.forEach((m) => nameMap.set(m.id, m.name));
        setMissionNames(nameMap);
      }

      // join the inspector room on the shared socket
      leaveInspectorRoom = joinInspectorRoom(
        getClientSocket(),
        setConnectionStatus,
        (data: ServerSocketStatus) => {
          setServerSocketStatus(data);
          setLastUpdatedAt(new Date().toISOString());
        }
      );
    });
    return () => {
      cancelled = true;
      leaveInspectorRoom?.();
    };
  }, [navigate, runLoad]);

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin" className={adminCommon.backLink}>
          ← Admin
        </Link>
        <h1 className={adminCommon.pageTitle}>Visitor Connections</h1>
        <AsyncStatus {...loading} />
        {!loading.pending && !loading.error && (
          <AsyncStatus
            pending={
              connectionStatus === "connecting"
                ? "Connecting to server..."
                : connectionStatus === "connected" && !serverSocketStatus
                  ? "Loading visitor connections..."
                  : null
            }
            error={connectionStatus === "failed" ? "Unable to connect to server." : null}
          />
        )}

        <section className={adminCommon.section}>
          <div className={adminCommon.infoItem}>
            <div>
              <FontAwesomeIcon icon={faComputer} className={adminCommon.mutedIcon} />
              <span className={adminCommon.infoLabel}> Server App Version: </span>
              <span className={adminCommon.infoValue}>{appVersion?.version}</span>
            </div>
            <div>
              <span className={adminCommon.infoLabel}>Git Commit Hash: </span>
              <span className={adminCommon.infoValue}>{appVersion?.gitCommit}</span>
            </div>
            <div>
              <span className={adminCommon.infoLabel}>Server Epoch UUID: </span>
              <span className={adminCommon.infoValue}>{appVersion?.serverEpochUuid}</span>
            </div>
          </div>
        </section>

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
      </div>
    </main>
  );
};

// Key for the group of visitors who are not on a mission or dashboard page
const NOT_ON_MISSION_GROUP_KEY = "notOnMission";

const visitorPageLabels: Record<AppPages, string> = {
  home: "Home",
  mission: "Mission",
  dashboard: "Dashboard",
  admin: "Admin",
  versionCheck: "Version check",
  other: "Other",
};

const PrintUserLists: FunctionComponent<{
  visitorData: VisitorData[];
  missionNames: Map<number, string>;
}> = ({ visitorData, missionNames }) => {
  const missionIds = uniq(
    visitorData.map((visitor) => visitor.missionId).filter((missionId) => missionId !== null)
  ).sort((a, b) => a - b);
  const notOnMissionVisitorData = visitorData.filter((visitor) => visitor.missionId === null);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initialState: Record<string, boolean> = { [NOT_ON_MISSION_GROUP_KEY]: true };
    const missionIds = uniq(visitorData.map((visitor) => visitor.missionId));
    missionIds.forEach((missionId) => {
      if (missionId !== null) initialState[missionId] = true;
    });
    setExpandedGroups(initialState);
  }, [visitorData]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  return (
    <>
      {missionIds.map((missionId) => {
        const groupKey = missionId.toString();
        const missionVisitorData = visitorData.filter((visitor) => visitor.missionId === missionId);
        const missionEditorData = missionVisitorData.filter((v) => v.permission === "editor");
        const missionViewerData = missionVisitorData.filter((v) => v.permission === "viewer");

        return (
          <section key={groupKey} className={adminCommon.section}>
            <div className={adminCommon.collapsibleHeader} onClick={() => toggleGroup(groupKey)}>
              <span className={adminCommon.collapsibleIcon}>
                <FontAwesomeIcon icon={expandedGroups[groupKey] ? faCaretDown : faCaretRight} />
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
            {expandedGroups[groupKey] && (
              <div className={adminCommon.details}>
                {missionEditorData.length > 0 && (
                  <PrintUsers
                    groupKey={groupKey}
                    visitorData={missionEditorData}
                    heading="Editors"
                    icon={faPen}
                  />
                )}
                {missionViewerData.length > 0 && (
                  <PrintUsers
                    groupKey={groupKey}
                    visitorData={missionViewerData}
                    heading="Viewers"
                    icon={faEye}
                  />
                )}
              </div>
            )}
          </section>
        );
      })}
      {notOnMissionVisitorData.length > 0 && (
        <section className={adminCommon.section}>
          <div
            className={adminCommon.collapsibleHeader}
            onClick={() => toggleGroup(NOT_ON_MISSION_GROUP_KEY)}
          >
            <span className={adminCommon.collapsibleIcon}>
              <FontAwesomeIcon
                icon={expandedGroups[NOT_ON_MISSION_GROUP_KEY] ? faCaretDown : faCaretRight}
              />
            </span>
            <h2 className={adminCommon.sectionHeading}>
              <FontAwesomeIcon icon={faUsers} className={adminCommon.mutedIcon} />
              Not on a mission
              <span className={adminCommon.badgeSuccess}>
                {notOnMissionVisitorData.length} connection
                {notOnMissionVisitorData.length !== 1 ? "s" : ""}
              </span>
            </h2>
          </div>
          {expandedGroups[NOT_ON_MISSION_GROUP_KEY] && (
            <div className={adminCommon.details}>
              <PrintUsers
                groupKey={NOT_ON_MISSION_GROUP_KEY}
                visitorData={notOnMissionVisitorData}
                heading="Visitors"
                icon={faComputer}
              />
            </div>
          )}
        </section>
      )}
    </>
  );
};

const PrintUsers: FunctionComponent<{
  groupKey: string;
  visitorData: VisitorData[];
  heading: string;
  icon: IconDefinition;
}> = ({ groupKey, visitorData, heading, icon }) => {
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
        <FontAwesomeIcon icon={icon} className={adminCommon.mutedIcon} />
        <span>
          {heading} ({visitorData.length})
        </span>
      </div>
      {showUsers && (
        <table className={adminCommon.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Page</th>
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
                <tr key={`${groupKey}-${record.socketId}-${index}`}>
                  {index === 0 ? <td rowSpan={allVisitorRecords.length}>{displayName}</td> : null}
                  <td>{record.page ? visitorPageLabels[record.page] : "Unknown"}</td>
                  <td>
                    {record.permission ? (
                      <span
                        className={
                          record.permission === "editor"
                            ? adminCommon.statusDisconnected
                            : adminCommon.statusConnected
                        }
                      >
                        {record.permission}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{record.appUser?.username || "N/A"}</td>
                  <td>{record.launchpadUser?.ip_address || "N/A"}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em" }}>
                    {record.clientAppVersion.version} – {record.clientAppVersion.gitCommit} –
                    {record.clientAppVersion.serverEpochUuid}
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

export default ServerSocketStatus;
