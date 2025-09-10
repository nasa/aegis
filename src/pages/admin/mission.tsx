import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getMissions } from "http-client/mission";
import styles from "components/admin/admin.module.css";
import Header from "components/interface/header";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleLeft } from "@fortawesome/free-regular-svg-icons";
import MissionEditor from "components/admin/missionEditor";
import { generateBlankMission } from "store/storeUtils/mission";

type RouteParams = {
  id: string;
};

const Mission: React.FunctionComponent = () => {
  const navigate = useNavigate();
  const [mission, setMission] = useState<Mission>(null);

  const params = useParams<RouteParams>();
  const slug = params.id;
  const intMissionId = parseInt(slug);

  useEffect(() => {
    if (intMissionId === 0) {
      const newMission: Mission = generateBlankMission();
      setMission(newMission);
    } else {
      (async () => {
        const response = await getMissions(intMissionId);
        if (response.data) {
          setMission(response.data[0]);
        }
      })();
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
        <MissionEditor mission={mission} setMission={setMission} />
      </div>
    </div>
  );
};

export default Mission;
