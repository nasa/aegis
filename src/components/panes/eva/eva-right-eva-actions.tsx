import type { FunctionComponent } from "react";
import { useCallback, useMemo, useState } from "react";
import actionsStyles from "../actions.module.css";
import evaStyles from "./eva.module.css";
import paneStyles from "../global-pane-styles.module.css";
import { useAppSelector, refEqual, deepEqual, shallowEqual } from "utils/useAppSelector";
import { ActionsTopSection, ActionsListHeadings, ActionList } from "../actions";
import { ExpandCollapseActionsButtons } from "../actions-action-body-multiselectors";
import { getCalculatedFieldsByEva } from "store/processing/calculatedFields";
import { EmojiRenderer } from "components/interface/emojis";
import { useMissionDocSelector } from "utils/useDocSelector";
import { getHighlightedActions } from "store/selectors";

const Actions_Panel: FunctionComponent = () => {
  const partialMission = useMissionDocSelector(
    (mission) => ({ walkbackRate: mission.walkbackRate, traverseRate: mission.traverseRate }),
    deepEqual
  );

  const selectedEvaUuid = useAppSelector((state) => state.eva.selectedEvaUuid, refEqual);
  const selectedEva = useMissionDocSelector(
    (mission) => mission.evas?.[selectedEvaUuid],
    deepEqual
  );
  const selectedRexUuid = useAppSelector((state) => state.rex.selectedRexUuid, refEqual);
  const selectedRexPartial = useMissionDocSelector((mission) => {
    const rex = mission.rexes?.[selectedRexUuid];
    if (rex) return { uuid: rex.uuid, name: rex.name };
    return undefined;
  }, deepEqual);
  const docMaps = useMissionDocSelector(
    (mission) => ({
      stations: mission.stations,
      actions: mission.actions,
      traverses: mission.traverses,
    }),
    shallowEqual
  );
  const sequenceStations = useMemo(() => {
    if (!docMaps) return [];
    const sequenceStationUuids = new Set(
      selectedEva?.sequence.filter((s) => s.type === "station").map((s) => s.uuid)
    );
    return Object.values(docMaps.stations).filter((station) =>
      sequenceStationUuids.has(station.uuid)
    );
  }, [docMaps, selectedEva]);
  const sequenceTraverses = useMemo(() => {
    if (!docMaps) return [];
    const sequenceTraverseUuids = new Set(
      selectedEva?.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid)
    );
    return Object.values(docMaps.traverses).filter((traverse) =>
      sequenceTraverseUuids.has(traverse.uuid)
    );
  }, [docMaps, selectedEva]);
  const evaActionsCalcFields = useMemo<ActionsCalculatedFields>(() => {
    if (!docMaps) return undefined;
    const sequenceStationUuids = new Set(sequenceStations.map((s) => s.uuid));
    const sequenceTraverseUuids = new Set(sequenceTraverses.map((t) => t.uuid));
    const evaCalculatedFields = getCalculatedFieldsByEva({
      eva: selectedEva,
      evaStations: sequenceStations,
      missionWalkbackRate: partialMission.walkbackRate,
      missionTraverseRate: partialMission.traverseRate,
      evaActions: Object.values(docMaps.actions).filter(
        (a) => sequenceStationUuids.has(a.stationUuid) || sequenceTraverseUuids.has(a.traverseUuid)
      ),
      evaTraverses: sequenceTraverses,
    });
    return {
      actionCount: evaCalculatedFields.actionCount,
      totalActionTime: evaCalculatedFields.totalActionTime,
      totalEv1Time: evaCalculatedFields.totalEv1Time,
      totalEv2Time: evaCalculatedFields.totalEv2Time,
      totalUnassignedTime: evaCalculatedFields.totalUnassignedTime,
      totalDwellTime: evaCalculatedFields.totalDwellTime,
      totalMass: evaCalculatedFields.totalMass,
    };
  }, [
    selectedEva,
    sequenceStations,
    sequenceTraverses,
    docMaps,
    partialMission.walkbackRate,
    partialMission.traverseRate,
  ]);

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
      if (!evaActionOrderUuids || !docMaps) return;
      const resHighlightActions = getHighlightedActions({
        actionUuids: evaActionOrderUuids,
        stmUuid: level3Uuid,
        actions: docMaps.actions,
      });
      setIsActionHighlighted(resHighlightActions);
    },
    [evaActionOrderUuids, docMaps]
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
