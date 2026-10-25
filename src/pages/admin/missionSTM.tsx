import { isLoggedIn } from "http-client/login";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import MissionSTM from "components/admin/missionSTM";
import MissionPriorityImportExport from "components/admin/missionPriorityImportExport";
import adminCommon from "./adminCommon.module.css";
import { getAutomergeDocListing } from "http-client/docListing";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";

type RouteParams = {
  id: string;
};

const MissionSTMPage: React.FunctionComponent = () => {
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

  const [automergeUrl, setAutomergeUrl] = useState<AutomergeUrl>();
  useEffect(() => {
    if (!authorized) return;
    getAutomergeDocListing(intMissionId).then((res) => {
      if (res.data?.[0] && isValidAutomergeUrl(res.data[0].automergeUrl)) {
        setAutomergeUrl(res.data[0].automergeUrl as AutomergeUrl);
      }
    });
  }, [intMissionId, authorized]);
  const [missionDoc] = useDocument<Mission>(automergeUrl);
  const missionName = missionDoc?.name;

  if (!authorized) return null;

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Mission STM</h1>
        {missionName && (
          <div className={adminCommon.missionSubheader}>
            <span className={adminCommon.missionSubheaderLabel}>Mission</span>
            <span className={adminCommon.missionSubheaderName}>{missionName}</span>
          </div>
        )}
        <section className={adminCommon.section}>
          <MissionSTM missionId={intMissionId} />
        </section>
        {automergeUrl && (
          <section className={adminCommon.section}>
            <MissionPriorityImportExport automergeUrl={automergeUrl} />
          </section>
        )}
      </div>
    </main>
  );
};

export default MissionSTMPage;
