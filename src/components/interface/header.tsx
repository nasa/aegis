import headerStyles from "./header.module.css";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { useNavigate } from "react-router";

import { faBars, faEye, faPen, faPersonWalkingArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useState } from "react";
import PetInterval from "../page/petInterval";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkJumpToRunningRex } from "store/thunk/thunkRex";
import { getAsPlannedEvaFromRefUuid } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";
import { prefixUrl } from "utils/basePath";

const Header: FunctionComponent = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const partialMission = useMissionDocSelector(
    (doc) => ({ name: doc.name, missionBanner: doc.missionBanner }),
    deepEqual
  );

  const setSocketConnectionStatus = useAppSelector(
    (state) => state.connection.socketStatus.connectionStatus,
    refEqual
  );
  const visitorCounts = useAppSelector(
    (state) => state.connection.socketStatus.lastStatusFromServer.visitorCounts,
    shallowEqual
  );
  const runningRex = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );
  const runningAsPlannedEvaName = useAppSelector((state) => {
    const runningEva = state.eva.evas.find((eva) => eva.uuid === runningRex?.evaUuid);
    if (!runningEva) return "";
    return getAsPlannedEvaFromRefUuid(state, runningEva.refUuid)?.name;
  }, refEqual);

  // used to update the PET value via the PetInterval component
  const [rexPetTime, setRexPetTime] = useState("");

  return (
    <>
      <PetInterval runningRex={runningRex} rexPetTime={rexPetTime} setRexPetTime={setRexPetTime} />
      <div className={headerStyles.left}>
        <div className={headerStyles.item}>
          <div className={headerStyles.helpMenu}>
            <div className={headerStyles.verticalCenter}>
              <FontAwesomeIcon
                icon={faBars}
                className={headerStyles.icon}
                onClick={() => {
                  navigate("/");
                }}
                size="lg"
              />
            </div>
          </div>
        </div>
        {partialMission?.name && ( // mission doesn't exist when viewing backend admin page
          <div className={headerStyles.item}>
            <div className={headerStyles.missionName} aria-label="missionNameHeader">
              {partialMission.name}
            </div>
          </div>
        )}
        {runningRex && (
          <div className={headerStyles.item}>
            <div
              className={headerStyles.rexContainer}
              onClick={() => dispatch(thunkJumpToRunningRex())}
            >
              <FontAwesomeIcon
                icon={faPersonWalkingArrowRight}
                size="lg"
                className={headerStyles.rexIcon}
              />
              <div className={headerStyles.rexLabel}>
                {runningAsPlannedEvaName} - {runningRex?.name}
              </div>
              <div className={headerStyles.rexPetTime}>{rexPetTime}</div>
              <div className={headerStyles.rexLabel}>PET</div>
            </div>
          </div>
        )}
      </div>
      {partialMission?.missionBanner && (
        <div className={headerStyles.center}>
          <div className={headerStyles.item}>
            <div className={headerStyles.missionBannerText} aria-label="missionBannerText">
              {partialMission.missionBanner}
            </div>
          </div>
        </div>
      )}

      <div className={headerStyles.right}>
        <div
          className={headerStyles.userCount}
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
          <div className={headerStyles.userCountText}>{visitorCounts?.editors || 0}</div>
          <FontAwesomeIcon icon={faEye} style={{ marginLeft: "6px" }} />
          <div className={headerStyles.userCountText}>{visitorCounts?.viewers || 0}</div>
        </div>
        <div className={headerStyles.verticalCenter}>
          <span className={headerStyles.wordMark}>AEGIS</span>
        </div>
        <div className={headerStyles.logoRight}>
          <div>
            <img
              className={headerStyles.meatball}
              src={prefixUrl("/images/logo_NASA.svg")}
              alt="NASA meatball"
            />
          </div>
          <div
            className={headerStyles.logoEmssWrapper}
            onClick={() => {
              window.open(
                "https://wiki.jsc.nasa.gov/fod/index.php/EVA_Mission_Systems_Software",
                "_blank"
              );
            }}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html="More info about EVA Mission System Software (EMSS)"
          >
            <span className={headerStyles.logoEmss} />
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
