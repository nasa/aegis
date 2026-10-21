import { useAsyncStatus } from "components/admin/useAsyncStatus";
import AsyncStatus from "components/admin/asyncStatus";
import { useAdminMission } from "components/admin/useAdminMission";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { duplicateMission } from "http-client/mission";
import adminCommon from "./adminCommon.module.css";

type RouteParams = {
  id: string;
};

const AdminMissionDuplicate: React.FunctionComponent = () => {
  const action = useAsyncStatus();
  const [status, setStatus] = useState<string>("Idle");

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  const mission = useAdminMission(intMissionId);
  const { mission: missionDoc } = mission;
  const missionName = missionDoc?.name;

  const onDuplicateMission = async (missionId: number) => {
    const response = await duplicateMission(missionId);
    if (response.status !== "success") {
      throw new Error(response.message || "Error duplicating mission");
    }
    setStatus(response.message);
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Duplicate Mission</h1>
        <AsyncStatus {...mission} />
        {missionName && (
          <div className={adminCommon.missionSubheader}>
            <span className={adminCommon.missionSubheaderLabel}>Mission</span>
            <span className={adminCommon.missionSubheaderName}>{missionName}</span>
          </div>
        )}
        <p className={adminCommon.introText}>
          Duplicate mission will copy the mission and all GIS map products (Data and Layers) to a
          new mission. The new mission will have a new ID and the same name with (copy) appended.
        </p>

        <section className={adminCommon.section}>
          <h2 className={adminCommon.sectionHeading}>Duplication</h2>
          <div className={adminCommon.details}>
            <p className={adminCommon.descriptionText}>
              This process may take some time depending on the size of the mission and the number of
              GIS products. Please be patient and do not refresh the page or navigate away.
            </p>
            <div className={adminCommon.actionButtons}>
              <button
                className={adminCommon.buttonPrimary}
                type="button"
                disabled={!!action.pending || !!mission.pending || !!mission.error}
                onClick={() => {
                  action.run("Duplicating mission and GIS files...", () =>
                    onDuplicateMission(intMissionId)
                  );
                }}
              >
                Duplicate Mission
              </button>
            </div>
            <AsyncStatus {...action} />
            <p className={adminCommon.statusMessage}>
              <strong>Status:</strong> {status}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};

export default AdminMissionDuplicate;
