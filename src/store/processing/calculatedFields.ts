import { calcPathDurationMins, calculateAscentAndDescent } from "utils/geoMath";
import { mergeEquipmentItems } from "store/storeUtils/store";
import { isNotNumber } from "utils/formatting";

export const getCalculatedFieldsByPoi = (params: {
  poiUuid: string;
  actions: Action[];
}): PoiCalculatedFields => {
  const { poiUuid, actions } = params;

  //get poi actions
  const poiActions = actions.filter(
    (storeAction) => storeAction.poiUuid === poiUuid && storeAction.enabled
  );

  //calculate total time
  let totalDuration = 0;
  let totalEv1Duration = 0;
  let totalEv2Duration = 0;
  let totalUnassignedDuration = 0;
  let totalDwellTime = 0;
  let actionCount = 0;
  let totalMass = 0;
  poiActions.forEach((action) => {
    totalDuration += action.duration;
    if (action.crewAssigned && action.crewAssigned.includes("EV1")) {
      totalEv1Duration += action.duration;
    }
    if (action.crewAssigned && action.crewAssigned.includes("EV2")) {
      totalEv2Duration += action.duration;
    }
    if (!action.crewAssigned || action.crewAssigned.length === 0) {
      totalUnassignedDuration += action.duration;
    }

    totalDwellTime = totalEv1Duration > totalEv2Duration ? totalEv1Duration : totalEv2Duration;
    actionCount++;
    totalMass += action.mass;
  });

  //generate report messages
  const newReportItems: ReportItem[] = [];

  // check if no actions
  if (poiActions.length === 0) {
    newReportItems.push({
      message: "POI has no actions",
      type: "warning",
    } as ReportItem);
  }

  const newCalculatedFields: PoiCalculatedFields = {
    uuid: poiUuid,
    reportItems: newReportItems,
    totalActionTime: totalDuration,
    totalEv1Time: totalEv1Duration,
    totalEv2Time: totalEv2Duration,
    totalUnassignedTime: totalUnassignedDuration,
    totalDwellTime: totalDwellTime,
    actionCount,
    totalMass,
  };

  return newCalculatedFields;
};

export const getCalculatedFieldsByStation = (params: {
  stationUuid: string;
  stations: Station[];
  mission: Mission;
  actions: Action[];
}): StationCalculatedFields => {
  const { stationUuid, stations, mission, actions } = params;
  const station = stations.find((storeStation) => storeStation.uuid === stationUuid);
  const missionWalkbackRate = mission?.walkbackRate;

  //get station actions
  const stationActions = actions.filter(
    (storeAction) => storeAction.stationUuid === station?.uuid && storeAction.enabled
  );

  //calculate total station time
  let totalDuration = 0;
  let totalEv1Duration = 0;
  let totalEv2Duration = 0;
  let totalUnassignedDuration = 0;
  let totalDwellTime = 0;

  let totalMass = 0;
  let actionCount = 0;
  let totalEquipmentItems: EquipmentItemUsage[] = [];
  stationActions.forEach((action) => {
    totalDuration += action.duration;
    if (action.crewAssigned?.includes("EV1")) {
      totalEv1Duration += action.duration;
    }
    if (action.crewAssigned?.includes("EV2")) {
      totalEv2Duration += action.duration;
    }
    if (!action.crewAssigned || action.crewAssigned.length === 0) {
      totalUnassignedDuration += action.duration;
    }

    totalDwellTime = totalEv1Duration > totalEv2Duration ? totalEv1Duration : totalEv2Duration;

    totalEquipmentItems = mergeEquipmentItems(action.equipmentItemsUsage, totalEquipmentItems);
    actionCount++;
    totalMass += action.mass;
  });

  //generate station report messages
  if (!station) return;
  const newReportItems: ReportItem[] = [];

  // check if station has no actions
  if (stationActions.length === 0) {
    newReportItems.push({
      message: "Station has no actions",
      type: "warning",
    } as ReportItem);
  }

  // check if station has no location
  if (!station.location) {
    newReportItems.push({
      message: "Station location not yet set",
      type: "warning",
    } as ReportItem);
  }

  // check if station duration is near calculated estimate
  if (!isNotNumber(station?.duration)) {
    if (station.duration < totalDwellTime * 0.75) {
      newReportItems.push({
        message:
          "Estimated station dwell time is significantly less than calculated dwell time from actions",
        type: "warning",
      } as ReportItem);
    } else if (station.duration < totalDwellTime * 0.9) {
      newReportItems.push({
        message: "Estimated station dwell time is less than calculated dwell time from actions",
        type: "error",
      } as ReportItem);
    } else if (station.duration > totalDwellTime * 1.25) {
      newReportItems.push({
        message:
          "Estimated station dwell time is significantly greater than calculated dwell time from actions",
        type: "warning",
      } as ReportItem);
    } else if (station.duration > totalDwellTime * 1.1) {
      newReportItems.push({
        message: "Estimated station dwell time is greater than calculated dwell time from actions",
        type: "error",
      } as ReportItem);
    }
  }

  // check if station has any unassigned action time
  if (totalUnassignedDuration > 0) {
    newReportItems.push({
      message: "Station has actions with no crew assigned. Dwell time calculation is incorrect",
      type: "error",
    } as ReportItem);
  }
  // check if station has no associated POIs
  if (!station.poiUuids || station.poiUuids.length === 0) {
    newReportItems.push({
      message: "Station has no associated POIs",
      type: "info",
    } as ReportItem);
  }

  // get walback duration minutes
  const walkbackDurationMinutes = calcPathDurationMins(
    station.walkbackPathSegmentDistances,
    station.walkbackTraverseRate ? station.walkbackTraverseRate : missionWalkbackRate
  );

  // get walkback distance meters
  const walkbackDistanceMeters = station.walkbackPathSegmentDistances?.reduce(
    (accumulator, currentVal) => accumulator + currentVal,
    0
  );

  // total ascended and descended
  const walkbackAscentDescent = calculateAscentAndDescent(station.walkbackPathSegmentElevations);

  const newCalculatedFields: StationCalculatedFields = {
    uuid: station.uuid,
    reportItems: newReportItems,
    totalActionTime: totalDuration,
    totalEv1Time: totalEv1Duration,
    totalEv2Time: totalEv2Duration,
    totalUnassignedTime: totalUnassignedDuration,
    totalDwellTime: totalDwellTime,
    actionCount,
    walkbackDurationMinutes,
    walkbackDistanceMeters,
    walkbackAscentDescent,
    equipmentItems: totalEquipmentItems,
    totalMass,
  };
  return newCalculatedFields;
};

export const getCalculatedFieldsByTraverse = (params: {
  traverseUuid: string;
  traverses: Traverse[];
  mission: Mission;
  evas: Eva[];
  actions: Action[];
}): TraverseCalculatedFields => {
  const { traverseUuid, traverses, mission, evas, actions } = params;
  const traverse = traverses.find((storeTraverse) => storeTraverse.uuid === traverseUuid);
  if (!traverse) return;
  const missionTraverseRate = mission?.traverseRate;

  //get traverse actions
  const traverseActions = actions.filter(
    (storeAction) => storeAction.traverseUuid === traverse.uuid && storeAction.enabled
  );

  //calculate total traverse action time
  let totalDuration = 0;
  let totalEv1Duration = 0;
  let totalEv2Duration = 0;
  let totalUnassignedDuration = 0;
  let totalDwellTime = 0;

  let totalMass = 0;
  let actionCount = 0;
  let totalEquipmentItems: EquipmentItemUsage[] = [];
  traverseActions.forEach((action) => {
    totalDuration += action.duration;
    if (action.crewAssigned?.includes("EV1")) {
      totalEv1Duration += action.duration;
    }
    if (action.crewAssigned?.includes("EV2")) {
      totalEv2Duration += action.duration;
    }
    if (!action.crewAssigned || action.crewAssigned.length === 0) {
      totalUnassignedDuration += action.duration;
    }

    totalDwellTime = totalEv1Duration > totalEv2Duration ? totalEv1Duration : totalEv2Duration;

    totalEquipmentItems = mergeEquipmentItems(action.equipmentItemsUsage, totalEquipmentItems);
    actionCount++;
    totalMass += action.mass;
  });

  const newReportItems: ReportItem[] = [];

  // find the eva this traverse is used in
  const eva = evas.find((eva) => {
    return eva.sequence.find((sequenceItem) => {
      return sequenceItem.uuid === traverse.uuid;
    });
  });

  let traverseRate = missionTraverseRate;
  if (eva.traverseRate) {
    traverseRate = eva.traverseRate;
  }
  if (traverse.traverseRate) {
    traverseRate = traverse.traverseRate;
  }

  // get duration minutes
  const durationMinutes = calcPathDurationMins(traverse.pathSegmentDistances, traverseRate);

  // get distance meters
  const distanceMeters = traverse.pathSegmentDistances?.reduce(
    (accumulator, currentVal) => accumulator + currentVal,
    0
  );

  // total ascended and descended
  const ascentDescent = calculateAscentAndDescent(traverse.pathSegmentElevations);

  // check if calculated duration is greater than predicted durationLower
  if (!isNotNumber(traverse?.duration)) {
    if (traverse?.duration > (durationMinutes + totalDuration) * 1.25) {
      newReportItems.push({
        message:
          "Traverse duration is significantly more than the calculated total duration of actions and movement",
        type: "warning",
      } as ReportItem);
    } else if (traverse?.duration > durationMinutes + totalDuration * 1.1) {
      newReportItems.push({
        message:
          "Traverse duration is more than the calculated total duration of actions and movement",
        type: "warning",
      } as ReportItem);
    } else if (traverse?.duration < (durationMinutes + totalDuration) * 0.75) {
      newReportItems.push({
        message:
          "Traverse duration is significantly less than the calculated total duration of actions and movement",
        type: "warning",
      } as ReportItem);
    } else if (traverse?.duration < durationMinutes + totalDuration * 0.9) {
      newReportItems.push({
        message:
          "Traverse duration is less than the calculated total duration of actions and movement",
        type: "warning",
      } as ReportItem);
    }
  }

  const newCalculatedFields: TraverseCalculatedFields = {
    uuid: traverse.uuid,
    reportItems: newReportItems,
    totalActionTime: totalDuration,
    totalEv1Time: totalEv1Duration,
    totalEv2Time: totalEv2Duration,
    totalUnassignedTime: totalUnassignedDuration,
    totalDwellTime: totalDwellTime,
    actionCount,
    totalMass,
    durationMinutes,
    distanceMeters,
    ascentDescent,
  };

  return newCalculatedFields;
};

export const getCalculatedTimeOfSequenceItem = (params: {
  evaUuid: string;
  sequenceItemUuid: string;
  evas: Eva[];
  stations: Station[];
  mission: Mission;
  actions: Action[];
  traverses: Traverse[];
}): string => {
  const { evaUuid, sequenceItemUuid, evas, stations, mission, actions, traverses } = params;
  const eva = evas.find((storeEva) => storeEva.uuid === evaUuid);

  if (!eva || !sequenceItemUuid || !eva.datetime) return;

  // get eva start time
  const evaStartTimeNumeric = new Date(eva.datetime).getTime();
  // go through eva sequence and calculate things
  const evaSequence = eva.sequence;

  let runningEvaSeconds = eva.egressDuration * 60; // start with egress duration
  let halfTime = 0;
  for (const seqItem of evaSequence) {
    let thisTraverseCalculatedTime: number;
    let thisStationCalculatedTime: number;
    if (seqItem.type === "station") {
      thisStationCalculatedTime = getCalculatedFieldsByStation({
        stationUuid: seqItem.uuid,
        stations: stations,
        mission: mission,
        actions: actions,
      }).totalDwellTime;
    } else if (seqItem.type === "traverse") {
      thisTraverseCalculatedTime = getCalculatedFieldsByTraverse({
        traverseUuid: seqItem.uuid,
        traverses: traverses,
        mission: mission,
        evas: evas,
        actions: actions,
      }).durationMinutes;
    }

    if (thisStationCalculatedTime) {
      runningEvaSeconds += thisStationCalculatedTime * 60;
      halfTime = (thisStationCalculatedTime * 60) / 2;
    } else if (thisTraverseCalculatedTime) {
      runningEvaSeconds += thisTraverseCalculatedTime * 60;
      halfTime = (thisTraverseCalculatedTime * 60) / 2;
    }

    if (seqItem.uuid === sequenceItemUuid) {
      break;
    }
  }

  const finalTimeInSeconds = (runningEvaSeconds - halfTime) * 1000 + evaStartTimeNumeric;
  return new Date(finalTimeInSeconds).toISOString();
};

export const getCalculatedFieldsByEva = (params: {
  evaUuid: string;
  evas: Eva[];
  stations: Station[];
  mission: Mission;
  actions: Action[];
  traverses: Traverse[];
}): EvaCalculatedFields => {
  const { evaUuid, evas, stations, mission, actions, traverses } = params;
  const eva = evas.find((storeEva) => storeEva.uuid === evaUuid);

  if (!eva) return;
  // go through eva sequence and calculate things
  const evaSequence = eva.sequence;

  //generate report messages
  const newReportItems: ReportItem[] = [];

  // check if no sequence items
  if (eva.sequence.length === 0) {
    newReportItems.push({
      message: "EVA has no stations or traverses",
      type: "warning",
    } as ReportItem);
  }

  const evaCalculatedFields: EvaCalculatedFields = {
    uuid: eva.uuid,
    reportItems: [], // report items for the eva itself
    totalActionTime: 0,
    totalEv1Time: 0,
    totalEv2Time: 0,
    totalUnassignedTime: 0,
    totalDwellTime: 0,
    actionCount: 0,
    totalTraverseTime: 0,
    totalTraverseDistanceMeters: 0,
    totalTraverseAscentDescent: {
      totalMetersClimbed: 0,
      totalMetersDescended: 0,
    },
    totalEvaTime: 0,
    equipmentItems: [],
    sequenceItemsCalculatedData: [],
    totalMass: 0,
  };

  let runningEvaSeconds = eva.egressDuration * 60; // start with egress duration
  let manualEvaSeconds = eva.egressDuration * 60; // start with egress duration
  for (const seqItem of evaSequence) {
    let thisStationCalculatedFields: StationCalculatedFields;
    let thisStation: Station;
    let thisTraverseCalculatedFields: TraverseCalculatedFields;
    let thisTraverse: Traverse;
    if (seqItem.type === "station") {
      thisStationCalculatedFields = getCalculatedFieldsByStation({
        stationUuid: seqItem.uuid,
        stations: stations,
        mission: mission,
        actions: actions,
      });
      thisStation = stations.find((station) => station.uuid === seqItem.uuid);
    } else if (seqItem.type === "traverse") {
      thisTraverseCalculatedFields = getCalculatedFieldsByTraverse({
        traverseUuid: seqItem.uuid,
        traverses: traverses,
        mission: mission,
        evas: evas,
        actions: actions,
      });
      thisTraverse = traverses.find((traverse) => traverse.uuid === seqItem.uuid);
    }

    if (thisStationCalculatedFields) {
      evaCalculatedFields.totalActionTime += thisStationCalculatedFields.totalActionTime;
      evaCalculatedFields.totalEv1Time += thisStationCalculatedFields.totalEv1Time;
      evaCalculatedFields.totalEv2Time += thisStationCalculatedFields.totalEv2Time;
      evaCalculatedFields.totalUnassignedTime += thisStationCalculatedFields.totalUnassignedTime;
      evaCalculatedFields.totalDwellTime += thisStationCalculatedFields.totalDwellTime;
      evaCalculatedFields.actionCount += thisStationCalculatedFields.actionCount;
      evaCalculatedFields.totalMass += thisStationCalculatedFields.totalMass;
      evaCalculatedFields.equipmentItems = mergeEquipmentItems(
        thisStationCalculatedFields.equipmentItems,
        evaCalculatedFields.equipmentItems
      );

      const manualDurationAddition = !isNotNumber(thisStation?.duration)
        ? thisStation.duration * 60
        : thisStationCalculatedFields.totalDwellTime * 60;
      evaCalculatedFields.sequenceItemsCalculatedData.push({
        uuid: seqItem.uuid,
        startSeconds: runningEvaSeconds,
        endSeconds: runningEvaSeconds + thisStationCalculatedFields.totalDwellTime * 60,
        manualStartSeconds: manualEvaSeconds,
        manualEndSeconds: manualEvaSeconds + manualDurationAddition,
      });
      runningEvaSeconds += thisStationCalculatedFields.totalDwellTime * 60;
      manualEvaSeconds += manualDurationAddition;
    } else if (thisTraverseCalculatedFields) {
      evaCalculatedFields.totalActionTime += thisTraverseCalculatedFields.totalActionTime;
      evaCalculatedFields.totalEv1Time += thisTraverseCalculatedFields.totalEv1Time;
      evaCalculatedFields.totalEv2Time += thisTraverseCalculatedFields.totalEv2Time;
      evaCalculatedFields.totalUnassignedTime += thisTraverseCalculatedFields.totalUnassignedTime;
      evaCalculatedFields.totalDwellTime += thisTraverseCalculatedFields.totalDwellTime;
      evaCalculatedFields.actionCount += thisTraverseCalculatedFields.actionCount;
      evaCalculatedFields.totalMass += thisTraverseCalculatedFields.totalMass;
      runningEvaSeconds += thisTraverseCalculatedFields.totalDwellTime * 60;

      evaCalculatedFields.totalTraverseTime += thisTraverseCalculatedFields.durationMinutes;
      evaCalculatedFields.totalTraverseDistanceMeters +=
        thisTraverseCalculatedFields.distanceMeters;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersClimbed;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersDescended;
      const totalTraverseDuration =
        (thisTraverseCalculatedFields.totalDwellTime +
          thisTraverseCalculatedFields.durationMinutes) *
        60;

      const manualTraverseDuration = !isNotNumber(thisTraverse?.duration)
        ? thisTraverse.duration * 60
        : totalTraverseDuration;
      evaCalculatedFields.sequenceItemsCalculatedData.push({
        uuid: seqItem.uuid,
        startSeconds: runningEvaSeconds,
        endSeconds: runningEvaSeconds + totalTraverseDuration,
        manualStartSeconds: manualEvaSeconds,
        manualEndSeconds: manualEvaSeconds + manualTraverseDuration,
      });
      runningEvaSeconds += totalTraverseDuration;
      manualEvaSeconds += manualTraverseDuration;
    }
  }

  evaCalculatedFields.totalEvaTime =
    evaCalculatedFields.totalDwellTime +
    evaCalculatedFields.totalTraverseTime +
    eva.egressDuration +
    eva.ingressDuration;

  // check if max time exceeds limit
  if (
    eva.duration &&
    evaCalculatedFields.totalEvaTime > eva.duration &&
    evaCalculatedFields.totalEvaTime <= eva.duration
  ) {
    newReportItems.push({
      message:
        "Calculated max EVA duration exceeds defined maximum by " +
        (evaCalculatedFields.totalEvaTime - eva.duration).toFixed(0) +
        " minutes but calculated nominal EVA duration is within limit",
      type: "warning",
    } as ReportItem);
  } else if (
    // check if max time exceeds limit and is also above nominal
    eva.duration &&
    evaCalculatedFields.totalEvaTime > eva.duration * 1.25
  ) {
    newReportItems.push({
      message:
        "Calculated max EVA duration exceeds defined maximum by " +
        (evaCalculatedFields.totalEvaTime - eva.duration).toFixed(0) +
        " minutes",
      type: "error",
    } as ReportItem);
  }
  // check if nominal time exceeds limit
  if (eva.duration && evaCalculatedFields.totalEvaTime > eva.duration * 0.75) {
    newReportItems.push({
      message:
        "Calculated nominal EVA duration exceeds defined maximum by " +
        (evaCalculatedFields.totalEvaTime - eva.duration).toFixed(0) +
        " minutes",
      type: "error",
    } as ReportItem);
  }

  evaCalculatedFields.reportItems = newReportItems;

  return evaCalculatedFields;
};
