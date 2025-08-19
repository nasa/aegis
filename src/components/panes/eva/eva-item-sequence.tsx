import { FunctionComponent } from "react";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { Button } from "components/interface/form/globalFields";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import SequenceItemTraverse from "./eva-item-sequence-traverse";
import SequenceItemStation from "./eva-item-sequence-station";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkAddStationToEva } from "store/thunk/thunkEva";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { decodeEmoji, hmmFromMinutes } from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { RexStatusMenu } from "../rex/rex-status-menu";
import { setSelectedEvaSequenceItemUuid, setSelectedEvaUuid } from "store/eva";

export const EvaSequence: FunctionComponent<{
  evaUuid: string;
}> = ({ evaUuid }) => {
  const dispatch = useAppDispatch();
  const eva = useAppSelector((state) => {
    return state.eva.evas.find((eva) => eva.uuid === evaUuid);
  }, deepEqual);
  const editMode = useAppSelector((state) => state.eva.evasEditing.includes(evaUuid), refEqual);
  const isRexEva = useAppSelector((state) => {
    const rexEvaUuids = state.rex.rexes.map((rex) => rex.evaUuid);
    return rexEvaUuids.includes(evaUuid);
  }, refEqual);

  return (
    <>
      <div className={evaStyles.evaSequenceContainer}>
        <EvaEgressIngressListing eva={eva} isEgress={true} isRexEva={isRexEva} />
        <EvaItemSequence evaUuid={evaUuid} />
        <EvaEgressIngressListing eva={eva} isEgress={false} isRexEva={isRexEva} />
      </div>
      {editMode && (
        <div className={evaStyles.evaFooterContainer}>
          <div className={paneStyles.iconButtons}>
            <Button
              onClick={() => {
                dispatch(thunkAddStationToEva({ evaUuid }));
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
  eva: Eva;
  isEgress: boolean;
  isRexEva: boolean;
}> = ({ isEgress, eva, isRexEva }) => {
  const dispatch = useAppDispatch();
  const station = useAppSelector((state) => {
    return state.station.stations.find(
      (station) => station.uuid === (isEgress ? eva.egressLocationUuid : eva.ingressLocationUuid)
    );
  }, deepEqual);

  // returns the rex from db object if this is a rex eva and is executing
  const rexFromDbIfExecuting = useAppSelector((state) => {
    if (!isRexEva) return null;
    return state.rex.rexesFromDb.find((rex) => rex.isRunning && rex.evaUuid === eva.uuid);
  }, deepEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  const xgressIdentifier = isEgress ? "egress" : "ingress";

  const xgressRexStatus = useAppSelector((state) => {
    const rex = state.rex.rexes.find((rex) => rex.evaUuid === eva.uuid);
    if (!rex || !rex.xgressEntries) return null;
    return rex.xgressEntries[xgressIdentifier]?.rexStatus;
  }, deepEqual);

  let xgressStyle = null;
  if (
    (xgressIdentifier === "egress" && hoverItemUuid === eva.egressLocationUuid) ||
    (xgressIdentifier === "ingress" && hoverItemUuid === eva.ingressLocationUuid)
  ) {
    xgressStyle = evaStyles.evaItemNameHoverMode;
  }

  if (xgressRexStatus === "in-progress") {
    xgressStyle = evaStyles.evaItemNameRexInProgress;
  } else if (xgressRexStatus === "complete") {
    xgressStyle = evaStyles.evaItemNameRexComplete;
  } else if (xgressRexStatus === "skipped") {
    xgressStyle = evaStyles.evaItemNameRexSkipped;
  }

  const icon = station ? station.icon : "1f680"; //rocket
  const name = `${isEgress ? "Egress" : "Ingress"} at ${station ? station.name : "Lander"}`;

  return (
    <div className={evaStyles.evaItem}>
      <div className={evaStyles.iconCustom}>{decodeEmoji(icon)}</div>
      {isRexEva && (
        <RexStatusMenu
          rexStatus={xgressRexStatus}
          divClassName={evaStyles.rexStatusWrapper}
          entryType="xgress"
          uuid={xgressIdentifier}
          editPerms={!!(editPerms && rexFromDbIfExecuting)} // the !! converts result into boolean
          maestroControlled={rexFromDbIfExecuting?.maestroControlled}
        />
      )}
      <div
        className={`${evaStyles.evaItemName} ${xgressStyle}`}
        style={{ cursor: "pointer" }}
        onClick={() => {
          dispatch(setSelectedEvaUuid(eva.uuid));
          dispatch(thunkSetRightPanelIsOpenIfAuto(true));
          dispatch(setSelectedEvaSequenceItemUuid(null));
        }}
        onMouseEnter={() => {
          dispatch(
            setHoverUuidsForSequence({
              sequenceUuid: isEgress ? eva.egressLocationUuid : eva.ingressLocationUuid,
              mapItemType: null,
            })
          );
        }}
        onMouseLeave={() => {
          dispatch(setHoverUuidsForSequence({ sequenceUuid: null, mapItemType: null }));
        }}
      >
        <div className={evaStyles.evaItemLeft}>
          <div className={evaStyles.evaItemNameText}>{name}</div>
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
  const isThisRexEvaExecuting = useAppSelector((state) => {
    const rex = state.rex.rexesFromDb.find((rex) => rex.isRunning && rex.evaUuid === evaUuid);
    return !!rex; // !! converts to boolean
  }, refEqual);

  const evaSequence = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === evaUuid)?.sequence,
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
