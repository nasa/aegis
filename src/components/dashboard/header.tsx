import styles from "./header.module.css";
import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useNavigate } from "react-router";
import { FunctionComponent, useState } from "react";
import {
  faArrowDownUpAcrossLine,
  faArrowRightArrowLeft,
  faBars,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DashboardPETClock from "./headerPetClock";
import ReactDOMServer from "react-dom/server";
import { longdateFromDateString } from "utils/formatting";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";

const DashboardHeader: FunctionComponent = () => {
  const missionName = useAppSelector((state) => state.mission.mission?.name, refEqual);
  const runningRexName = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning)?.name,
    refEqual
  );
  const runningAsPlannedEvaName = useAppSelector((state) => {
    const runningRex = state.rex.rexesFromDb.find((rex) => rex.isRunning);
    if (!runningRex) return undefined;
    const runningEva = state.eva.evas.find((eva) => eva.uuid === runningRex.evaUuid);
    return getAsPlannedEvaFromRefUuid(state, runningEva.refUuid)?.name;
  }, refEqual);
  const socketStatus = useAppSelector((state) => state.interface.socketStatus, deepEqual);

  const [isMouseInHeader, setIsMouseInHeader] = useState(false);

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
      <div className={styles.left}>
        <div className={styles.item}>
          <div className={styles.headerLabel}>Mission</div>
          <div className={styles.headerText}>{missionName}</div>
        </div>
        {runningAsPlannedEvaName && (
          <div className={styles.item}>
            <div className={styles.headerLabel}>EVA</div>
            <div className={styles.headerText}>{runningAsPlannedEvaName}</div>
          </div>
        )}
        {runningRexName && (
          <div className={styles.item}>
            <div className={styles.headerLabel}>Execution</div>
            <div className={styles.headerText}>{runningRexName}</div>
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
          <FontAwesomeIcon
            icon={
              socketStatus.connectionStatus === "connected"
                ? faArrowRightArrowLeft
                : faArrowDownUpAcrossLine
            }
            size="xl"
            className={
              socketStatus.connectionStatus === "connected"
                ? styles.connectionIcon
                : styles.connectionIconBroken
            }
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
        </div>
        <div className={styles.item}>
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
        {runningRexName && (
          <div className={styles.item}>
            <DashboardPETClock />
          </div>
        )}
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
