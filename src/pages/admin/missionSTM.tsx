import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import MissionSTM from "components/admin/missionSTM";
import adminCommon from "./adminCommon.module.css";
import { getAutomergeDocListing } from "http-client/docListing";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";

type RouteParams = {
  id: string;
};

const MissionSTMPage: React.FunctionComponent = () => {
  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const [automergeUrl, setAutomergeUrl] = useState<AutomergeUrl>();
  useEffect(() => {
    getAutomergeDocListing(intMissionId).then((res) => {
      if (res.data?.[0] && isValidAutomergeUrl(res.data[0].automergeUrl)) {
        setAutomergeUrl(res.data[0].automergeUrl as AutomergeUrl);
      }
    });
  }, [intMissionId]);
  const [missionDoc] = useDocument<Mission>(automergeUrl);
  const missionName = missionDoc?.name;

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
      </div>
    </main>
  );
};

export default MissionSTMPage;
