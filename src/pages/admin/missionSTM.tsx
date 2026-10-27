import AsyncStatus from "components/admin/asyncStatus";
import { useAdminMission } from "components/admin/useAdminMission";
import { Link, useParams } from "react-router";
import MissionSTM from "components/admin/missionSTM";
import MissionPriorityImportExport from "components/admin/missionPriorityImportExport";
import adminCommon from "./adminCommon.module.css";

type RouteParams = {
  id: string;
};

const MissionSTMPage: React.FunctionComponent = () => {
  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const mission = useAdminMission(intMissionId);
  const { automergeUrl, mission: missionDoc } = mission;
  const missionName = missionDoc?.name;

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Mission STM</h1>
        <AsyncStatus {...mission} />
        {missionName && (
          <div className={adminCommon.missionSubheader}>
            <span className={adminCommon.missionSubheaderLabel}>Mission</span>
            <span className={adminCommon.missionSubheaderName}>{missionName}</span>
          </div>
        )}
        {automergeUrl && !mission.pending && !mission.error && (
          <section className={adminCommon.section}>
            <MissionSTM missionId={intMissionId} automergeUrl={automergeUrl} />
          </section>
        )}
        {automergeUrl && !mission.pending && !mission.error && (
          <section className={adminCommon.section}>
            <MissionPriorityImportExport automergeUrl={automergeUrl} />
          </section>
        )}
      </div>
    </main>
  );
};

export default MissionSTMPage;
