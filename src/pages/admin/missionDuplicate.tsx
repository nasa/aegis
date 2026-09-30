import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { duplicateMission } from "http-client/mission";
import adminCommon from "./adminCommon.module.css";
import { getAutomergeDocListing } from "http-client/docListing";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";

type RouteParams = {
  id: string;
};

const AdminMissionDuplicate: React.FunctionComponent = () => {
  const [status, setStatus] = useState<string>("Idle");

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

  const onDuplicateMission = async (missionId: number) => {
    setStatus("Duplicating mission...");
    const response = await duplicateMission(missionId);
    if (response.status === "success") {
      setStatus(response.message);
    } else {
      setStatus("Error duplicating mission");
    }
  };

  return (
    <main className={adminCommon.page}>
      <div className={adminCommon.container}>
        <Link to="/admin/missions" className={adminCommon.backLink}>
          ← Missions
        </Link>
        <h1 className={adminCommon.pageTitle}>Duplicate Mission</h1>
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
                onClick={() => {
                  onDuplicateMission(intMissionId);
                }}
              >
                Duplicate Mission
              </button>
            </div>
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
