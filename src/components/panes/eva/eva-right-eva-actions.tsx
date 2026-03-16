import type { FunctionComponent } from "react";
import { useCallback, useState } from "react";
import actionsStyles from "../actions.module.css";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, refEqual, deepEqual } from "utils/useAppSelector";
import { ActionsTopSection, ActionsListHeadings, ActionList } from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { thunkGetHighlightedActions } from "store/thunk/thunkAction";
import { useAppDispatch } from "utils/useAppDispatch";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";
import { EmojiRenderer } from "components/interface/emojis";
import { useMissionDocSelector } from "utils/useDocSelector";

const Actions_Panel: FunctionComponent = () => {
  const dispatch = useAppDispatch();
  const partialMission = useMissionDocSelector(
    (doc) => ({ walkbackRate: doc.walkbackRate, traverseRate: doc.traverseRate }),
    deepEqual
  );

  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid),
    deepEqual
  );
  const selectedRexPartial = useAppSelector((state) => {
    const rex = state.rex.rexes.find((rex) => rex.uuid === state.rex.selectedRexUuid);
    if (rex) return { uuid: rex.uuid, name: rex.name };
  }, deepEqual);
  const sequenceStations = useAppSelector((state) => {
    const sequenceUuids = selectedEva?.sequence.map((sequenceItem) => sequenceItem.uuid);
    return state.station.stations.filter((station) => sequenceUuids.includes(station.uuid));
  }, deepEqual);
  const sequenceTraverses = useAppSelector((state) => {
    const sequenceUuids = selectedEva?.sequence.map((sequenceItem) => sequenceItem.uuid);
    return state.traverse.traverses.filter((traverse) => sequenceUuids.includes(traverse.uuid));
  }, deepEqual);

  const evaActionsCalcFields = useAppSelector((state) => {
    const eva = state.eva.evas.find((eva) => eva.uuid === selectedEvaUuid);
    const evaCalculatedFields = getCalculatedFieldsByEva({
      eva,
      evaStations: state.station.stations,
      missionWalkbackRate: partialMission.walkbackRate,
      missionTraverseRate: partialMission.traverseRate,
      evaActions: state.action.actions,
      evaTraverses: state.traverse.traverses,
    });
    const newActionsCalculatedFields: ActionsCalculatedFields = {
      actionCount: evaCalculatedFields.actionCount,
      totalActionTime: evaCalculatedFields.totalActionTime,
      totalEv1Time: evaCalculatedFields.totalEv1Time,
      totalEv2Time: evaCalculatedFields.totalEv2Time,
      totalUnassignedTime: evaCalculatedFields.totalUnassignedTime,
      totalDwellTime: evaCalculatedFields.totalDwellTime,
      totalMass: evaCalculatedFields.totalMass,
    };
    return newActionsCalculatedFields;
  }, deepEqual);

  const editPerms = useAppSelector((state) => state.user.missionPerms.permissions.edit, refEqual);

  const evaActionOrderUuids = selectedEva?.sequence.flatMap((sequenceItem) => {
    if (sequenceItem.type === "station") {
      return sequenceStations.find((station) => station.uuid === sequenceItem.uuid)
        ?.actionOrderUuids;
    } else if (sequenceItem.type === "traverse") {
      return sequenceTraverses.find((traverse) => traverse.uuid === sequenceItem.uuid)
        ?.actionOrderUuids;
    }
  });

  const [isActionHighlighted, setIsActionHighlighted] = useState<ActionHighlight[]>([]);

  //set state of highlighted actions when the STM is hovered over
  const highlightActions = useCallback(
    async (level3Uuid: string) => {
      if (!evaActionOrderUuids) return;
      const resHighlightActions = await dispatch(
        thunkGetHighlightedActions({ actionUuids: evaActionOrderUuids, stmUuid: level3Uuid })
      );
      if (resHighlightActions.payload) {
        setIsActionHighlighted(resHighlightActions.payload);
      }
    },
    [evaActionOrderUuids, dispatch]
  );

  return (
    <div className={paneStyles.rightBody}>
      <div className={paneStyles.rightBodyTitleContainer}>
        <div className={paneStyles.rightBodyTitle}>
          All EVA Actions ({selectedRexPartial ? `${selectedRexPartial.name}` : "As Planned"})
        </div>
        <ExpandCollapseActionsButtons actionUuids={evaActionOrderUuids} />
      </div>
      <div className={paneStyles.rightBodyBody} style={{ overflowY: "hidden" }}>
        <ActionsTopSection
          actionOrderUuids={evaActionOrderUuids}
          showDwell={true}
          highlightActions={highlightActions}
          actionsCalculatedFields={evaActionsCalcFields}
          rexUuid={selectedRexPartial?.uuid}
        />
        <ActionsListHeadings
          editMode={false}
          showCrewHeading={true}
          editPerms={editPerms}
          isRex={!!selectedRexPartial}
        />

        <div className={actionsStyles.actionListContainer}>
          {selectedEva.sequence.map((sequenceItem, index) => {
            if (sequenceItem.type === "station") {
              const station = sequenceStations.find(
                (station) => station.uuid === sequenceItem.uuid
              );
              if (!station) {
                return (
                  <div key={`${sequenceItem.uuid}-${index}`}>
                    <div className={actionsStyles.evaActionsStationTitleContainer}>
                      <div className={evaStyles.iconCustomSmall}></div>
                      <div>No Station Selected</div>
                      <div className={actionsStyles.evaActionsStationTitleLine}></div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={`${sequenceItem.uuid}-${index}`}>
                    <div className={actionsStyles.evaActionsStationTitleContainer}>
                      <div className={evaStyles.iconCustomSmall}>
                        <EmojiRenderer iconValue={station.icon} />
                      </div>
                      <div>{station.name}</div>
                      <div className={actionsStyles.evaActionsStationTitleLine}></div>
                    </div>
                    <ActionList
                      editMode={false}
                      actionOrderUuids={station.actionOrderUuids}
                      parentType="station"
                      highlightActions={highlightActions}
                      isActionHighlighted={isActionHighlighted}
                      stations={sequenceStations}
                      pois={null}
                      rexUuid={selectedRexPartial?.uuid}
                    />
                  </div>
                );
              }
            } else if (sequenceItem.type === "traverse") {
              const traverse = sequenceTraverses.find(
                (traverse) => traverse.uuid === sequenceItem.uuid
              );
              return (
                <div key={sequenceItem.uuid}>
                  <div className={actionsStyles.evaActionsStationTitleContainer}>
                    <div className={evaStyles.iconTraverseDotsContainerSmall}>
                      <div className={evaStyles.iconTraverseSmall} />
                    </div>
                    <div>{traverse?.name}</div>
                    <div className={actionsStyles.evaActionsStationTitleLine}></div>
                  </div>
                  <ActionList
                    editMode={false}
                    actionOrderUuids={traverse?.actionOrderUuids}
                    parentType="traverse"
                    highlightActions={highlightActions}
                    isActionHighlighted={isActionHighlighted}
                    stations={sequenceStations}
                    pois={null}
                    rexUuid={selectedRexPartial?.uuid}
                  />
                </div>
              );
            }
          })}
        </div>
      </div>
    </div>
  );
};

export default Actions_Panel;
