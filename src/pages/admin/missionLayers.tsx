import AsyncStatus from "components/admin/asyncStatus";
import { useAdminMission } from "components/admin/useAdminMission";
import { isLoggedIn } from "http-client/login";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Layers from "components/admin/layers";
import adminCommon from "./adminCommon.module.css";

type RouteParams = {
  id: string;
};

const MissionLayersPage: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    let mounted = true;
    isLoggedIn()
      .then((result) => {
        if (result.status === "success" && (result.data?.isSuperAdmin || result.data?.isAdmin)) {
          if (mounted) setAuthorized(true);
        } else navigate("/");
      })
      .catch(() => navigate("/"));
    return () => {
      mounted = false;
    };
  }, [navigate]);
  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const mission = useAdminMission(intMissionId);
  const { mission: missionDoc } = mission;
  const missionName = missionDoc?.name;

  if (!authorized) return null;

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Mission Layers</h1>
        <AsyncStatus {...mission} />
        {missionName && (
          <div className={adminCommon.missionSubheader}>
            <span className={adminCommon.missionSubheaderLabel}>Mission</span>
            <span className={adminCommon.missionSubheaderName}>{missionName}</span>
          </div>
        )}
        <Layers missionId={intMissionId} />
      </div>
    </main>
  );
};

export default MissionLayersPage;
