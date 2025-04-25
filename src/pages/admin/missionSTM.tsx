import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getMissions } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import MissionSTM from "components/admin/missionSTM";
import { generateBlankMission } from "store/storeUtils/mission";

type RouteParams = {
  id: string;
};

const MissionSTMPage: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [mission, setMission] = useState<Mission>(null);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  useEffect(() => {
    const loadMission = async () => {
      const response = await getMissions(intMissionId);
      if (response.data) {
        setMission(response.data[0]);
      }
    };

    function createNewMission() {
      const newMission: Mission = generateBlankMission();
      setMission(newMission);
    }

    if (intMissionId === 0) {
      createNewMission();
    } else {
      loadMission();
    }
  }, [intMissionId]);

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
        {mission && <MissionSTM mission={mission} setMission={setMission} />}
      </div>
    </div>
  );
};

export default MissionSTMPage;
