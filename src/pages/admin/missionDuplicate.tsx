import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { duplicateMission } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";

type RouteParams = {
  id: string;
};

const AdminMissionDuplicate: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("Idle");

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

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
    <div className={styles.pageStyle}>
      <div className={styles.header}>
        <Header />
      </div>

      <div className={styles.bodyContent}>
        <div className={styles.missionBack}>
          <FontAwesomeIcon
            icon={faArrowAltCircleLeft}
            size="xl"
            onClick={() => {
              navigate("/admin/missions");
            }}
          />
        </div>
        Duplicate mission will duplicate the mission and copy all of the GIS map products (Data and
        Layers) to the new mission. The new mission will be created with a new ID and the same name
        as the original mission with (copy) appended. You can then edit the new mission as needed.
        <br />
        <br />
        Note that this process will take some time depending on the size of the mission and the
        number of GIS products. Please be patient and do not refresh the page or navigate away from
        it.
        <br />
        <br />
        <button
          type="button"
          onClick={() => {
            onDuplicateMission(intMissionId);
          }}
        >
          Duplicate Mission {intMissionId}
        </button>
        <br />
        <br />
        Status: {status}
      </div>
    </div>
  );
};

export default AdminMissionDuplicate;
