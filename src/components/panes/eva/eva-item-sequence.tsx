import type { FunctionComponent } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import SequenceItemTraverse from "./eva-item-sequence-traverse";
import SequenceItemStation from "./eva-item-sequence-station";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkDocAddStationToEva } from "store/thunk/thunkEva";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { hmmFromMinutes } from "utils/formatting";
import { EmojiRenderer } from "components/interface/emojis";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { RexStatusMenu } from "../rex/rex-status-menu";
import { setSelectedEvaSequenceItemUuid, setSelectedEvaUuid } from "store/eva";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getSequenceItemRowStyles } from "utils/component-helpers";

export const EvaSequence: FunctionComponent<{
  evaUuid: string;
}> = ({ evaUuid }) => {
  const dispatch = useAppDispatch();
  const editMode = useAppSelector((state) => state.mission.isInEditMode, refEqual);
  const isRexEva = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).some((rex) => rex.evaUuid === evaUuid);
  }, refEqual);

  return (
    <>
      <div className={evaStyles.evaSequenceContainer}>
        <EvaEgressIngressListing evaUuid={evaUuid} isEgress={true} isRexEva={isRexEva} />
        <EvaItemSequence evaUuid={evaUuid} />
        <EvaEgressIngressListing evaUuid={evaUuid} isEgress={false} isRexEva={isRexEva} />
      </div>
      {editMode && (
        <div className={evaStyles.evaFooterContainer}>
          <div className={paneStyles.iconButtons}>
            <Button
              onClick={() => {
                dispatch(thunkDocAddStationToEva({ evaUuid }));
              }}
              label="Add Station"
              icon={faPlusCircle}
              style={{ width: "105px" }}
            />
          </div>
        </div>
      )}
    </>
  );
};

export const EvaEgressIngressListing: FunctionComponent<{
  evaUuid: string;
  isEgress: boolean;
  isRexEva: boolean;
}> = ({ isEgress, evaUuid, isRexEva }) => {
  const dispatch = useAppDispatch();
  const eva = useMissionDocSelector((mission) => mission.evas?.[evaUuid], deepEqual);
  const stationIconAndName: { name: string; icon: string } = useMissionDocSelector((mission) => {
    const station = mission.stations[isEgress ? eva?.egressLocationUuid : eva?.ingressLocationUuid];
    if (!station) return null;
    return { name: station?.name, icon: station?.icon };
  }, deepEqual);

  // returns the running rex if this is a rex eva and is executing
  const rexIfExecuting = useMissionDocSelector((mission) => {
    if (!isRexEva || !mission?.rexes) return null;
    return (
      Object.values(mission.rexes).find((rex) => rex.isRunning && rex.evaUuid === eva?.uuid) ?? null
    );
  }, deepEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  const xgressIdentifier = isEgress ? "egress" : "ingress";

  const xgressRexStatus = useMissionDocSelector((mission) => {
    if (!mission?.rexes || !eva?.uuid) return null;
    const rex = Object.values(mission.rexes).find((rex) => rex.evaUuid === eva.uuid);
    if (!rex || !rex.xgressEntries) return null;
    return rex.xgressEntries[xgressIdentifier]?.rexStatus;
  }, deepEqual);

  if (!eva) return null;

  const xgressLocationUuid = isEgress ? eva.egressLocationUuid : eva.ingressLocationUuid;

  // egress/ingress rows are never "selected" (selection happens at the EVA level)
  const { rowClassName, nameClassName } = getSequenceItemRowStyles({
    rexStatus: xgressRexStatus,
    isSelected: false,
    isHovered: hoverItemUuid === xgressLocationUuid,
    isRexEva,
  });

  // if egress / ingress is at a station, use station icon
  let xgressIcon;
  if (stationIconAndName) {
    const icon = stationIconAndName.icon ? stationIconAndName.icon : "2754";
    xgressIcon = <EmojiRenderer iconValue={icon} />;
  } else {
    xgressIcon = <img src="/images/lander.svg" alt="lander" className={evaStyles.landerImage} />;
  }

  const xgressName = `${isEgress ? "Egress" : "Ingress"} at ${stationIconAndName ? stationIconAndName.name : "Lander"}`;

  return (
    <div
      className={`${evaStyles.evaItem} ${rowClassName}`}
      style={{ cursor: "pointer" }}
      onClick={() => {
        dispatch(setSelectedEvaUuid(eva.uuid));
        dispatch(thunkSetRightPanelIsOpenIfAuto(true));
        dispatch(setSelectedEvaSequenceItemUuid(null));
      }}
      onMouseEnter={() => {
        dispatch(
          setHoverUuidsForSequence({
            sequenceUuid: xgressLocationUuid,
            mapItemType: null,
          })
        );
      }}
      onMouseLeave={() => {
        dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
      }}
    >
      <div className={evaStyles.iconCustom}>{xgressIcon}</div>
      {isRexEva && (
        <RexStatusMenu
          rexStatus={xgressRexStatus}
          divClassName={evaStyles.rexStatusWrapper}
          entryType="xgress"
          uuid={xgressIdentifier}
          editPerms={!!(editPerms && rexIfExecuting)} // the !! converts result into boolean
          maestroControlled={rexIfExecuting?.maestroControlled}
        />
      )}
      <div className={`${evaStyles.evaItemName} ${nameClassName}`}>
        <div className={evaStyles.evaItemLeft}>
          <div className={evaStyles.evaItemNameText}>{xgressName}</div>
        </div>
        <div className={evaStyles.evaItemRight}>
          <div
            className={evaStyles.evaItemRightItem}
            data-tooltip-id="aegis-tooltip"
            data-tooltip-html={isEgress ? "Egress duration (hh:mm)" : "Ingress duration (hh:mm)"}
            data-tooltip-place="right"
          >
            {hmmFromMinutes(isEgress ? eva.egressDuration : eva.ingressDuration)}
          </div>
        </div>
      </div>
    </div>
  );
};

const EvaItemSequence: FunctionComponent<{
  evaUuid: string;
}> = ({ evaUuid }) => {
  const isThisRexEvaExecuting = useMissionDocSelector((mission) => {
    if (!mission?.rexes) return false;
    return Object.values(mission.rexes).some((rex) => rex.isRunning && rex.evaUuid === evaUuid);
  }, refEqual);

  const evaSequence = useMissionDocSelector(
    (mission) => mission.evas?.[evaUuid]?.sequence,
    deepEqual
  );

  return (
    <div className={evaStyles.evaSequence}>
      {evaSequence?.map((sequenceItem, index) => {
        if (sequenceItem.type === "station") {
          return (
            <SequenceItemStation
              evaUuid={evaUuid}
              stationUuid={sequenceItem.uuid}
              isRexRunning={isThisRexEvaExecuting}
              key={`${sequenceItem.uuid}-${index}`}
            />
          );
        } else if (sequenceItem.type === "traverse") {
          return (
            <SequenceItemTraverse
              evaUuid={evaUuid}
              traverseUuid={sequenceItem.uuid}
              isRexRunning={isThisRexEvaExecuting}
              key={`${sequenceItem.uuid}-${index}`}
            />
          );
        }
      })}
    </div>
  );
};

export default EvaItemSequence;
