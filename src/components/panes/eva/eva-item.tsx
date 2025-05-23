import { ModifiedIndicator } from "components/interface/_global-elements";
import { Button } from "components/interface/form/globalFields";
import { FunctionComponent, useCallback, useState } from "react";
import { useAppSelector, refEqual, shallowEqual, deepEqual } from "utils/useAppSelector";
import {
  setSelectedEvaRightNavItem,
  setExpandedEvaUuids,
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
} from "store/eva";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faCaretRight,
  faPlusCircle,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import { setSelectedStationUuid } from "store/station";
import EvaItemSequence from "./eva-item-sequence";
import { thunkSelectEVASequenceItem } from "store/thunk/crossThunk";
import { useAppDispatch } from "utils/useAppDispatch";
import { thunkAddStationToEva } from "store/thunk/thunkEva";
import {
  decodeEmoji,
  hhmmssFromSeconds,
  hmmFromMinutes,
  secondsFromhhmmss,
} from "utils/formatting";
import { setHoverUuidsForSequence } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { RexStatusMenu } from "../rex/rex";
import last from "lodash/last";
import PetInterval from "components/page/petInterval";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";

const EvaItem: FunctionComponent<{ eva: Eva; first?: boolean }> = ({ eva, first = false }) => {
  const dispatch = useAppDispatch();
  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);

  const thisEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((evaItem) => evaItem.uuid === eva.uuid),
    deepEqual
  );

  const traversesInEva = useAppSelector((state) => {
    const traverseUuidInEva = eva.sequence.filter((item) => item.type === "traverse");
    const traverseSubset = state.traverse.traverses.filter((traverse) =>
      traverseUuidInEva.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
    );
    return traverseSubset;
  }, deepEqual);
  const traversesInEvaFromDb = useAppSelector((state) => {
    const traverseUuidInEva = thisEvaFromDb?.sequence.filter((item) => item.type === "traverse");
    const traverseSubset = state.traverse.traverses.filter((traverse) =>
      traverseUuidInEva?.find((traverseUuid) => traverseUuid.uuid === traverse.uuid)
    );
    return traverseSubset;
  }, deepEqual);

  const editMode = useAppSelector((state) => state.eva.evasEditing.includes(eva.uuid), refEqual);
  const selectedEvaSequenceItemUuid = useAppSelector(
    (state) => state.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const selectedRightNavItem = useAppSelector(
    (state) => state.eva.selectedEvaRightNavItem,
    refEqual
  );
  const expandedEvaUuids = useAppSelector((state) => state.eva.expandedEvaUuids, shallowEqual);

  let evaSelectionStyle = null;
  let settingsIconColor = "var(--grey4)";

  // if this eva is selected, highlight or emphasize it
  if (eva.uuid === selectedEvaUuid) {
    evaSelectionStyle = evaStyles.nameSelected;
    settingsIconColor = "var(--grey1)";

    // if there is a selected sequence item and it's in this eva, then only emphasize the eva name rather than highlighting it
    if (selectedEvaSequenceItemUuid) {
      const evaSequenceItem = eva.sequence.find(
        (sequenceItem) => sequenceItem.uuid === selectedEvaSequenceItemUuid
      );
      if (evaSequenceItem) {
        evaSelectionStyle = evaStyles.nameEmphasized;
        settingsIconColor = "var(--grey4)";
      }
    }
  }

  return (
    <div
      className={evaStyles.evaContainer}
      style={{ borderTop: first ? null : "1px var(--grey3) solid" }}
    >
      <div className={evaStyles.nameitem} key={eva.uuid}>
        <div
          className={evaStyles.nameCaret}
          onClick={() => {
            // toggle the expansion of this eva item
            if (expandedEvaUuids.find((uuid) => uuid === eva.uuid)) {
              dispatch(setExpandedEvaUuids(expandedEvaUuids.filter((uuid) => uuid !== eva.uuid)));
            } else {
              if (!expandedEvaUuids.find((uuid) => uuid === eva.uuid)) {
                dispatch(setExpandedEvaUuids([...expandedEvaUuids, eva.uuid]));
              }
            }
          }}
        >
          <FontAwesomeIcon
            icon={expandedEvaUuids.find((uuid) => uuid === eva.uuid) ? faCaretDown : faCaretRight}
            style={{ color: "var(--grey4)" }}
          />
        </div>
        <div
          className={`${evaStyles.name} ${evaSelectionStyle}`}
          onClick={() => {
            if (selectedEvaUuid === eva.uuid && selectedEvaSequenceItemUuid === null) {
              dispatch(setSelectedEvaUuid(null));
              dispatch(thunkSetRightPanelIsOpenIfAuto(false));
            } else {
              dispatch(setSelectedEvaUuid(eva.uuid));

              if (!selectedRightNavItem) dispatch(setSelectedEvaRightNavItem("info_panel"));
              dispatch(thunkSetRightPanelIsOpenIfAuto(true));

              // add this eva uuid to the expanded list if it's not already there
              if (expandedEvaUuids.indexOf(eva.uuid) === -1) {
                dispatch(setExpandedEvaUuids([...expandedEvaUuids, eva.uuid]));
              }
            }
            dispatch(thunkSelectEVASequenceItem({ sequenceItemUuid: null }));
            dispatch(setSelectedStationUuid(null));
          }}
        >
          <div className={evaStyles.nameText}>{eva.name}</div>
          <ModifiedIndicator
            obj1={[eva, ...traversesInEva]}
            obj2={[thisEvaFromDb, ...traversesInEvaFromDb]}
          />

          <div className={evaStyles.nameItemRightSpacer} />
          <div className={evaStyles.nameItemsRightButton}>
            <FontAwesomeIcon icon={faSliders} style={{ color: settingsIconColor }} />
          </div>
        </div>
      </div>
      {expandedEvaUuids.find((uuid) => uuid === eva.uuid) && (
        <div className={evaStyles.evaSequenceContainer}>
          <EvaEgressIngressListing eva={eva} isEgress={true} />
          <EvaItemSequence evaUuid={eva.uuid} evaSequence={eva.sequence} editMode={editMode} />
          <EvaEgressIngressListing eva={eva} isEgress={false} />
        </div>
      )}
      {editMode && (
        <div className={evaStyles.evaFooterContainer}>
          <div className={paneStyles.iconButtons}>
            <Button
              enabled={traversesInEva.every((eva) => eva.name != "")}
              onClick={() => {
                dispatch(thunkAddStationToEva({ evaUuid: eva.uuid }));
              }}
              label="Add Station"
              icon={faPlusCircle}
              style={{ width: "105px" }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EvaItem;

export const EvaEgressIngressListing: FunctionComponent<{
  eva: Eva;
  isEgress: boolean;
}> = ({ isEgress: isEgress, eva }) => {
  const dispatch = useAppDispatch();
  const station = useAppSelector((state) => {
    return state.station.stations.find(
      (station) => station.uuid === (isEgress ? eva.egressLocationUuid : eva.ingressLocationUuid)
    );
  }, deepEqual);

  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((rex) => rex.isRunning),
    deepEqual
  );

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const hoverItemUuid = useAppSelector((state) => state.hover.leftPanelHoverItemUuid, refEqual);

  const xgressIdentifier = isEgress ? "egress" : "ingress";

  const xgressRexStatus = useAppSelector((state) => {
    const rex = state.rex.rexesFromDb.find((rex) => rex.isRunning);
    if (!rex || !rex.xgressEntries) return null;
    return last(rex.xgressEntries[xgressIdentifier])?.rexStatus;
  }, shallowEqual);

  const [rexPetTime, setRexPetTime] = useState("");

  const evaCalculatedFields: EvaCalculatedFields = useAppSelector(
    (state) =>
      getCalculatedFieldsByEva({
        evaUuid: eva.uuid,
        evas: state.eva.evas,
        stations: state.station.stations,
        mission: state.mission.mission,
        actions: state.action.actions,
        traverses: state.traverse.traverses,
      }),
    deepEqual
  );

  const displayInProgressItemTimeRemaining = useCallback(
    (rexPetSeconds: number) => {
      if (!evaCalculatedFields) return null;
      const totalEvaTime = evaCalculatedFields.totalEvaTime.durationUpper;
      let secondsRemaining = 0;
      if (xgressIdentifier === "egress") {
        secondsRemaining = (eva.egressDuration * 60 - rexPetSeconds) * -1;
      } else {
        secondsRemaining = (totalEvaTime * 60 - eva.ingressDuration * 60 - rexPetSeconds) * -1;
      }
      return hhmmssFromSeconds(secondsRemaining);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaCalculatedFields, eva]
  );

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
    <div
      className={evaStyles.evaItem}
      style={
        isEgress
          ? { borderBottom: "1px var(--grey3) solid" }
          : { borderTop: "1px var(--grey3) solid" }
      }
    >
      <PetInterval
        runningRex={runningRexFromDb}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <div className={evaStyles.iconCustom}>{decodeEmoji(icon)}</div>
      {runningRexFromDb && (
        <RexStatusMenu
          rexStatus={xgressRexStatus}
          divClassName={evaStyles.rexStatusWrapper}
          entryType="xgress"
          uuid={xgressIdentifier}
          editPerms={editPerms}
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
          {runningRexFromDb && xgressRexStatus === "in-progress" && (
            <div
              className={evaStyles.evaItemRightItem}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html={"Time remaining (hh:mm:ss)"}
              data-tooltip-place="right"
            >
              {displayInProgressItemTimeRemaining(secondsFromhhmmss(rexPetTime))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
