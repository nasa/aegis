import headerStyles from "./header.module.css";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { useNavigate } from "react-router";

import { faBars, faEye, faPen, faPersonWalkingArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FunctionComponent, useState } from "react";
import PetInterval from "../page/petInterval";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkJumpToRunningRex } from "store/thunk/thunkRex";

const Header: FunctionComponent = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
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
        <div className={headerStyles.item}>
          <div className={headerStyles.missionName} aria-label="missionNameHeader">
            {missionName}
          </div>
        </div>
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
                {runningEvaName} - {runningRex?.name}
              </div>
              <div className={headerStyles.rexPetTime}>{rexPetTime}</div>
              <div className={headerStyles.rexLabel}>PET</div>
            </div>
          </div>
        )}
      </div>
      {banner && (
        <div className={headerStyles.center}>
          <div className={headerStyles.item}>
            <div className={headerStyles.missionBannerText} aria-label="missionBannerText">
              {banner}
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
              src="/images/logo_NASA.svg"
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
