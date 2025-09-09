import { FunctionComponent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { isLoggedIn } from "http-client/login";
import adminStyles from "components/admin/admin.module.css";
import React from "react";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import { faCaretDown, faCaretRight, faPen, faEye } from "@fortawesome/free-solid-svg-icons";
import uniq from "lodash/uniq";

const ServerSocketStatus: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [serverSocketStatus, setServerSocketStatus] = useState<ServerSocketStatus>(null);

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
          <h2>Maestro Connections</h2>
          {!serverSocketStatus?.maestroVisitors?.length ? (
            <p>No Maestro servers connected.</p>
          ) : (
            <ul>
              {serverSocketStatus.maestroVisitors.map((visitor) => (
                <li key={visitor.socketId}>
                  <strong>{visitor.name}</strong> (connected at{" "}
                  {new Date(visitor.connectedAt).toUTCString()})
                </li>
              ))}
            </ul>
          )}
          <h2>Visitor Connections</h2>
          {!serverSocketStatus?.visitorsData?.length ? (
            <p>No visitors connected.</p>
          ) : (
            <PrintUsers visitorData={serverSocketStatus?.visitorsData} />
          )}
        </div>
      </div>
    </>
  );
};

const PrintUsers: FunctionComponent<{
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
        // Filter data for this mission
        const missionVisitorData = visitorData.filter((visitor) => visitor.missionId === missionId);

        // Get sorted unique users in this mission
        const launchpadUsers = missionVisitorData.map((visitor) => visitor.launchpadUser);
        const uniqueUsers = launchpadUsers.filter(
          (user, index) =>
            launchpadUsers.findIndex((visitor) => visitor?.uupic === user?.uupic) === index
        );
        uniqueUsers.sort((a, b) => {
          const sa = a?.surname || "";
          const sb = b?.surname || "";
          return sa.localeCompare(sb);
        });

        // Count editor and viewer connections
        const editorCount = missionVisitorData.filter((v) => v.permission === "editor").length;
        const viewerCount = missionVisitorData.filter((v) => v.permission === "viewer").length;

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
                MissionId {missionId}: ({editorCount} <FontAwesomeIcon icon={faPen} /> {viewerCount}{" "}
                <FontAwesomeIcon icon={faEye} />)
              </h3>
            </div>

            {expandedMissions[missionId] && (
              <ul>
                {uniqueUsers.map((user) => {
                  const allVisitorRecords = missionVisitorData.filter(
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
                            <div
                              style={{ paddingLeft: "20px" }}
                              key={`${record.socketId}-${index}`}
                            >
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
                              Version: {record.appVersion.version} - {record.appVersion.gitCommit}{" "}
                              <br />
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
      })}
    </div>
  );
};

export default ServerSocketStatus;
