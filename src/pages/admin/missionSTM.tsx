import { useNavigate, useParams } from "react-router";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import MissionSTM from "components/admin/missionSTM";

type RouteParams = {
  id: string;
};

const MissionSTMPage: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

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
        <MissionSTM missionId={intMissionId} />
      </div>
    </div>
  );
};

export default MissionSTMPage;
