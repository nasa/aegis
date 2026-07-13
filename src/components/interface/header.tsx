import headerStyles from "./header.module.css";
import { useAppSelector, shallowEqual, deepEqual, refEqual } from "utils/useAppSelector";
import { useNavigate } from "react-router";

import { faBars, faEye, faPen, faPersonWalkingArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FunctionComponent } from "react";
import { useState } from "react";
import PetInterval from "../page/petInterval";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkUIJumpToRunningRex } from "store/thunk/thunkRex";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getAsPlannedEvaFromRefUuid, isConnected } from "store/selectors";
import { ToggleButton } from "components/interface/form/globalFieldsAutomerge";
import { setIsInEditMode } from "store/mission";
import { thunkCancelMarkerMapDirective } from "store/thunk/thunkMap";

const Header: FunctionComponent = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const partialMission = useMissionDocSelector(
    (mission) => ({ name: mission.name, missionBanner: mission.missionBanner }),
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
  const runningRex = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return null;
    return Object.values(mission.rexes).find((rex) => rex.isRunning) ?? null;
  }, deepEqual);
  const runningAsPlannedEvaName = useMissionDocSelector((mission) => {
    if (!mission?.evas || !mission?.rexes) return "";
    const runningRex = Object.values(mission.rexes).find((rex) => rex.isRunning);
    if (!runningRex) return "";
    const runningEva = mission.evas[runningRex.evaUuid];
    if (!runningEva) return "";
    const asPlannedEva = getAsPlannedEvaFromRefUuid(mission, runningEva.refUuid);
    return asPlannedEva?.name;
  }, refEqual);

  const isInEditMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);
  const editPerms = useAppSelector(
    (state) =>
      (state.user.missionPerms.permissions.edit && state.user.appUser.isAdmin) ||
      state.user.appUser.isSuperAdmin,
    refEqual
  );
  const isOnline = useAppSelector(isConnected, refEqual);

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
              onClick={() => dispatch(thunkUIJumpToRunningRex())}
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
        {partialMission?.name && editPerms && (
          <ToggleButton
            toggled={isInEditMode}
            isDisabled={!isOnline}
            onClick={() => {
              if (!isOnline) return;
              if (isInEditMode) {
                dispatch(thunkCancelMarkerMapDirective());
              }
              dispatch(setIsInEditMode(!isInEditMode));
            }}
            toolTip={
              isOnline
                ? `Turn ${isInEditMode ? "Off" : "On"} Edit Mode`
                : "Offline: Editing Disabled"
            }
            label="Edit"
            toggleAriaLabel="globalEditToggle"
          />
        )}
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
