import styles from "./header.module.css";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useNavigate } from "react-router-dom";
import { FunctionComponent, useState } from "react";
import PetInterval from "components/page/petInterval";
import {
  faArrowDownUpAcrossLine,
  faArrowRightArrowLeft,
  faBars,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ReactDOMServer from "react-dom/server";
import { longdateFromDateString } from "utils/formatting";

const DashboardHeader: FunctionComponent = () => {
  const missionName = useAppSelector((state) => state.mission.mission?.name, refEqual);
  const runningRex = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
  const runningEvaName = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === runningRex?.evaUuid)?.name,
    refEqual
  );
  const socketStatus = useAppSelector((state) => state.interface.socketStatus, deepEqual);

  const [isMouseInHeader, setIsMouseInHeader] = useState(false);
  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <div
      className={styles.headerWrapper}
      onMouseEnter={() => {
        setIsMouseInHeader(true);
      }}
      onMouseLeave={() => {
        setIsMouseInHeader(false);
      }}
    >
      <PetInterval runningRex={runningRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={styles.left}>
        <div className={styles.item}>
          <div className={styles.headerLabel}>Mission</div>
          <div className={styles.headerText}>{missionName}</div>
        </div>
        {runningEvaName && (
          <div className={styles.item}>
            <div className={styles.headerLabel}>EVA</div>
            <div className={styles.headerText}>{runningEvaName}</div>
          </div>
        )}
        {runningRex && (
          <div className={styles.item}>
            <div className={styles.headerLabel}>REX Event</div>
            <div className={styles.headerText}>{runningRex.name}</div>
          </div>
        )}
      </div>
      <div className={styles.right}>
        <div className={` ${styles.item}`}>
          <div className={`${!isMouseInHeader && styles.hide}`}>
            <DashboardMenu />
          </div>
        </div>
        <div className={`${styles.item}`}>
          {socketStatus.connectionStatus === "connected" ? (
            <FontAwesomeIcon
              icon={faArrowRightArrowLeft}
              size="xl"
              className={`${styles.connectionIcon} ${!isMouseInHeader && styles.hide}`}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={ReactDOMServer.renderToStaticMarkup(
                <>
                  Connected to server
                  <br />
                  Last Server Status:{" "}
                  {longdateFromDateString(
                    new Date(socketStatus.lastStatusFromServer.timestamp).toISOString()
                  ) || "None"}
                  <br />
                  Last Edit Event:{" "}
                  {longdateFromDateString(socketStatus.lastEditEvent?.datestamp) || "None"}
                  <br />
                  Editors: {socketStatus.lastStatusFromServer.visitorCounts.editors}
                  <br />
                  Viewers: {socketStatus.lastStatusFromServer.visitorCounts.viewers}
                </>
              )}
            />
          ) : (
            <FontAwesomeIcon
              icon={faArrowDownUpAcrossLine}
              size="xl"
              className={styles.connectionIconBroken}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={ReactDOMServer.renderToStaticMarkup(
                <>
                  <span className={styles.disconnectedText}>Disconnected from server</span>
                  <br />
                  Last Server Status:{" "}
                  {longdateFromDateString(
                    new Date(socketStatus.lastStatusFromServer.timestamp).toISOString()
                  ) || "None"}
                  <br />
                  Last Edit Event:{" "}
                  {longdateFromDateString(socketStatus.lastEditEvent?.datestamp) || "None"}
                </>
              )}
            />
          )}
        </div>
        <div className={styles.item}>
          <span className={styles.wordMark}>AEGIS</span>
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
      </div>
    </div>
  );
};

export default DashboardHeader;

const DashboardMenu: FunctionComponent = () => {
  const navigate = useNavigate();

  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <div
        className={styles.hamburgerMenu}
        onClick={(e) => {
          setShowMenu(!showMenu);
          navigate("/");
          e.stopPropagation();
        }}
      >
        <FontAwesomeIcon icon={faBars} size="xl" />
      </div>
      {showMenu && <></>}
    </>
  );
};
