import styles from "./header.module.css";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { useNavigate } from "react-router-dom";

import { faBars, faEye, faPen, faPersonWalkingArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent, useState } from "react";
import PetInterval from "../page/petInterval";

const Header: FunctionComponent = () => {
  const navigate = useNavigate();
  const missionName = useAppSelector((state) => state.mission.mission?.name, refEqual);
  const banner = useAppSelector((state) => state.mission.mission?.missionBanner, refEqual);
  const setSocketConnectionStatus = useAppSelector(
    (state) => state.interface.socketStatus.connectionStatus,
    refEqual
  );
  const visitorCounts = useAppSelector(
    (state) => state.interface.socketStatus.lastStatusFromServer.visitorCounts,
    shallowEqual
  );
  const runningRex = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
  const runningEvaName = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === runningRex?.evaUuid)?.name,
    refEqual
  );

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <>
      <PetInterval runningRex={runningRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={styles.left}>
        <div className={styles.item}>
          <div className={styles.helpMenu}>
            <div className={styles.verticalCenter}>
              <FontAwesomeIcon
                icon={faBars}
                className={styles.icon}
                onClick={() => {
                  navigate("/");
                }}
                size="lg"
              />
            </div>
          </div>
        </div>
        <div className={styles.item}>
          <div className={styles.missionName} aria-label="missionNameHeader">
            {missionName}
          </div>
        </div>
        {runningRex && (
          <div className={styles.item}>
            <div className={styles.rexContainer}>
              <FontAwesomeIcon
                icon={faPersonWalkingArrowRight}
                size="lg"
                className={styles.rexIcon}
              />
              <div className={styles.rexLabel}>
                {runningRex?.name} - {runningEvaName}
              </div>
              <div className={styles.rexPetTime}>{rexPetTime}</div>
              <div className={styles.rexLabel}>PET</div>
            </div>
          </div>
        )}
      </div>
      {banner && (
        <div className={styles.center}>
          <div className={styles.item}>
            <div className={styles.missionBannerText} aria-label="missionBannerText">
              {banner}
            </div>
          </div>
        </div>
      )}

      <div className={styles.right}>
        <div
          className={styles.userCount}
          data-tooltip-id="aegis-tooltip"
          data-tooltip-html={
            setSocketConnectionStatus === "connected"
              ? `Users active in this Mission:<br>` +
                `Editors: ${visitorCounts.editors || 0}<br>` +
                `Visitors: ${visitorCounts.viewers || 0}<br>` +
                `These numbers include you`
              : "Connection to server lost"
          }
          style={
            setSocketConnectionStatus === "connected"
              ? { color: "var(--grey5)" }
              : { color: "var(--grey3)" }
          }
        >
          <FontAwesomeIcon icon={faPen} />
          <div className={styles.userCountText}>{visitorCounts?.editors || 0}</div>
          <FontAwesomeIcon icon={faEye} style={{ marginLeft: "6px" }} />
          <div className={styles.userCountText}>{visitorCounts?.viewers || 0}</div>
        </div>
        <div className={styles.verticalCenter}>
          <span className={styles.wordMark}>AEGIS</span>
        </div>
        <div className={styles.logoRight}>
          <div>
            <img className={styles.meatball} src="/images/logo_NASA.svg" alt="NASA meatball" />
          </div>
          <div
            className={styles.logoEmssWrapper}
            onClick={() => {
              window.open(
                "https://wiki.jsc.nasa.gov/fod/index.php/EVA_Mission_Systems_Software",
                "_blank"
              );
            }}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html="More info about EVA Mission System Software (EMSS)"
          >
            <span className={styles.logoEmss} />
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
