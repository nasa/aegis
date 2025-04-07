import { calcPathDurationMins, calculateAscentAndDescent } from "utils/geoMath";
import { mergeEquipmentItems } from "store/storeUtils/store";

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
  let totalDurationLower = 0;
  let totalDurationUpper = 0;
  let totalEv1DurationLower = 0;
  let totalEv1DurationUpper = 0;
  let totalEv2DurationLower = 0;
  let totalEv2DurationUpper = 0;
  let totalUnassignedDurationLower = 0;
  let totalUnassignedDurationUpper = 0;
  let totalDwellTimeLower = 0;
  let totalDwellTimeUpper = 0;
  let actionCount = 0;
  let totalMass = 0;
  poiActions.forEach((action) => {
    totalDurationLower += action.durationLower;
    totalDurationUpper += action.durationUpper;
    if (action.crewAssigned && action.crewAssigned.includes("EV1")) {
      totalEv1DurationLower += action.durationLower;
      totalEv1DurationUpper += action.durationUpper;
    }
    if (action.crewAssigned && action.crewAssigned.includes("EV2")) {
      totalEv2DurationLower += action.durationLower;
      totalEv2DurationUpper += action.durationUpper;
    }
    if (!action.crewAssigned || action.crewAssigned.length === 0) {
      totalUnassignedDurationLower += action.durationLower;
      totalUnassignedDurationUpper += action.durationUpper;
    }
    totalDwellTimeLower =
      totalEv1DurationLower > totalEv2DurationLower ? totalEv1DurationLower : totalEv2DurationLower;

    totalDwellTimeUpper =
      totalEv1DurationUpper > totalEv2DurationUpper ? totalEv1DurationUpper : totalEv2DurationUpper;
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
    totalActionTime: {
      durationLower: totalDurationLower,
      durationUpper: totalDurationUpper,
    },
    totalEv1Time: {
      durationLower: totalEv1DurationLower,
      durationUpper: totalEv1DurationUpper,
    },
    totalEv2Time: {
      durationLower: totalEv2DurationLower,
      durationUpper: totalEv2DurationUpper,
    },
    totalUnassignedTime: {
      durationLower: totalUnassignedDurationLower,
      durationUpper: totalUnassignedDurationUpper,
    },
    totalDwellTime: {
      durationLower: totalDwellTimeLower,
      durationUpper: totalDwellTimeUpper,
    },
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
  let totalDurationLower = 0;
  let totalDurationUpper = 0;
  let totalEv1DurationLower = 0;
  let totalEv1DurationUpper = 0;
  let totalEv2DurationLower = 0;
  let totalEv2DurationUpper = 0;
  let totalUnassignedDurationLower = 0;
  let totalUnassignedDurationUpper = 0;
  let totalDwellTimeLower = 0;
  let totalDwellTimeUpper = 0;

  let totalMass = 0;
  let actionCount = 0;
  let totalEquipmentItems: EquipmentItemUsage[] = [];
  stationActions.forEach((action) => {
    totalDurationLower += action.durationLower;
    totalDurationUpper += action.durationUpper;
    if (action.crewAssigned?.includes("EV1")) {
      totalEv1DurationLower += action.durationLower;
      totalEv1DurationUpper += action.durationUpper;
    }
    if (action.crewAssigned?.includes("EV2")) {
      totalEv2DurationLower += action.durationLower;
      totalEv2DurationUpper += action.durationUpper;
    }
    if (!action.crewAssigned || action.crewAssigned.length === 0) {
      totalUnassignedDurationLower += action.durationLower;
      totalUnassignedDurationUpper += action.durationUpper;
    }
    totalDwellTimeLower =
      totalEv1DurationLower > totalEv2DurationLower ? totalEv1DurationLower : totalEv2DurationLower;

    totalDwellTimeUpper =
      totalEv1DurationUpper > totalEv2DurationUpper ? totalEv1DurationUpper : totalEv2DurationUpper;

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

  // check if station durationLower is greater than totalDurationLower
  if (station.durationLower < totalDwellTimeLower) {
    newReportItems.push({
      message:
        "Estimated nominal dwell time is less than calculated maximum dwell time from actions",
      type: "error",
    } as ReportItem);
  }

  // check if station durationUpper is greater than totalDurationUpper
  if (station.durationUpper < totalDwellTimeUpper) {
    newReportItems.push({
      message:
        "Estimated maximum dwell time is less than calculated maximum dwell time from actions",
      type: "error",
    } as ReportItem);
  }
  // check if station has any unassigned action time
  if (totalUnassignedDurationLower > 0 || totalUnassignedDurationUpper > 0) {
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
    totalActionTime: {
      durationLower: totalDurationLower,
      durationUpper: totalDurationUpper,
    },
    totalEv1Time: {
      durationLower: totalEv1DurationLower,
      durationUpper: totalEv1DurationUpper,
    },
    totalEv2Time: {
      durationLower: totalEv2DurationLower,
      durationUpper: totalEv2DurationUpper,
    },
    totalUnassignedTime: {
      durationLower: totalUnassignedDurationLower,
      durationUpper: totalUnassignedDurationUpper,
    },
    totalDwellTime: {
      durationLower: totalDwellTimeLower,
      durationUpper: totalDwellTimeUpper,
    },
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
  let totalDurationLower = 0;
  let totalDurationUpper = 0;
  let totalEv1DurationLower = 0;
  let totalEv1DurationUpper = 0;
  let totalEv2DurationLower = 0;
  let totalEv2DurationUpper = 0;
  let totalUnassignedDurationLower = 0;
  let totalUnassignedDurationUpper = 0;
  let totalDwellTimeLower = 0;
  let totalDwellTimeUpper = 0;

  let totalMass = 0;
  let actionCount = 0;
  let totalEquipmentItems: EquipmentItemUsage[] = [];
  traverseActions.forEach((action) => {
    totalDurationLower += action.durationLower;
    totalDurationUpper += action.durationUpper;
    if (action.crewAssigned?.includes("EV1")) {
      totalEv1DurationLower += action.durationLower;
      totalEv1DurationUpper += action.durationUpper;
    }
    if (action.crewAssigned?.includes("EV2")) {
      totalEv2DurationLower += action.durationLower;
      totalEv2DurationUpper += action.durationUpper;
    }
    if (!action.crewAssigned || action.crewAssigned.length === 0) {
      totalUnassignedDurationLower += action.durationLower;
      totalUnassignedDurationUpper += action.durationUpper;
    }
    totalDwellTimeLower =
      totalEv1DurationLower > totalEv2DurationLower ? totalEv1DurationLower : totalEv2DurationLower;

    totalDwellTimeUpper =
      totalEv1DurationUpper > totalEv2DurationUpper ? totalEv1DurationUpper : totalEv2DurationUpper;

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
    traverseRate = eva?.traverseRate;
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
  if (traverse.predictedDurationLower > durationMinutes) {
    newReportItems.push({
      message:
        "Calculated traverse duration (including actions) is under predicted nominal traverse time",
      type: "info",
    } as ReportItem);
  }

  // check if calculated duration is greater than predicted durationUpper
  if (traverse.predictedDurationUpper < durationMinutes) {
    newReportItems.push({
      message:
        "Calculated traverse duration (including actions) is over predicted maximum traverse time",
      type: "error",
    } as ReportItem);
  }

  const newCalculatedFields: TraverseCalculatedFields = {
    uuid: traverse.uuid,
    reportItems: newReportItems,
    totalActionTime: {
      durationLower: totalDurationLower,
      durationUpper: totalDurationUpper,
    },
    totalEv1Time: {
      durationLower: totalEv1DurationLower,
      durationUpper: totalEv1DurationUpper,
    },
    totalEv2Time: {
      durationLower: totalEv2DurationLower,
      durationUpper: totalEv2DurationUpper,
    },
    totalUnassignedTime: {
      durationLower: totalUnassignedDurationLower,
      durationUpper: totalUnassignedDurationUpper,
    },
    totalDwellTime: {
      durationLower: totalDwellTimeLower,
      durationUpper: totalDwellTimeUpper,
    },
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
      }).totalDwellTime.durationUpper;
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
    totalActionTime: {
      durationLower: 0,
      durationUpper: 0,
    },
    totalEv1Time: {
      durationLower: 0,
      durationUpper: 0,
    },
    totalEv2Time: {
      durationLower: 0,
      durationUpper: 0,
    },
    totalUnassignedTime: {
      durationLower: 0,
      durationUpper: 0,
    },
    totalDwellTime: {
      durationLower: 0,
      durationUpper: 0,
    },
    actionCount: 0,
    totalTraverseTime: 0,
    totalTraverseDistanceMeters: 0,
    totalTraverseAscentDescent: {
      totalMetersClimbed: 0,
      totalMetersDescended: 0,
    },
    totalEvaTime: {
      durationLower: 0,
      durationUpper: 0,
    },
    equipmentItems: [],
    sequenceItemsCalculatedData: [],
    totalMass: 0,
  };

  let runningEvaSeconds = eva.egressDuration * 60; // start with egress duration
  for (const seqItem of evaSequence) {
    let thisStationCalculatedFields: StationCalculatedFields;
    let thisTraverseCalculatedFields: TraverseCalculatedFields;
    if (seqItem.type === "station") {
      thisStationCalculatedFields = getCalculatedFieldsByStation({
        stationUuid: seqItem.uuid,
        stations: stations,
        mission: mission,
        actions: actions,
      });
    } else if (seqItem.type === "traverse") {
      thisTraverseCalculatedFields = getCalculatedFieldsByTraverse({
        traverseUuid: seqItem.uuid,
        traverses: traverses,
        mission: mission,
        evas: evas,
        actions: actions,
      });
    }

    if (thisStationCalculatedFields) {
      evaCalculatedFields.totalActionTime.durationLower +=
        thisStationCalculatedFields.totalActionTime.durationLower;
      evaCalculatedFields.totalActionTime.durationUpper +=
        thisStationCalculatedFields.totalActionTime.durationUpper;
      evaCalculatedFields.totalEv1Time.durationLower +=
        thisStationCalculatedFields.totalEv1Time.durationLower;
      evaCalculatedFields.totalEv1Time.durationUpper +=
        thisStationCalculatedFields.totalEv1Time.durationUpper;
      evaCalculatedFields.totalEv2Time.durationLower +=
        thisStationCalculatedFields.totalEv2Time.durationLower;
      evaCalculatedFields.totalEv2Time.durationUpper +=
        thisStationCalculatedFields.totalEv2Time.durationUpper;
      evaCalculatedFields.totalUnassignedTime.durationLower +=
        thisStationCalculatedFields.totalUnassignedTime.durationLower;
      evaCalculatedFields.totalUnassignedTime.durationUpper +=
        thisStationCalculatedFields.totalUnassignedTime.durationUpper;
      evaCalculatedFields.totalDwellTime.durationLower +=
        thisStationCalculatedFields.totalDwellTime.durationLower;
      evaCalculatedFields.totalDwellTime.durationUpper +=
        thisStationCalculatedFields.totalDwellTime.durationUpper;
      evaCalculatedFields.actionCount += thisStationCalculatedFields.actionCount;
      evaCalculatedFields.totalMass += thisStationCalculatedFields.totalMass;
      evaCalculatedFields.equipmentItems = mergeEquipmentItems(
        thisStationCalculatedFields.equipmentItems,
        evaCalculatedFields.equipmentItems
      );
      evaCalculatedFields.sequenceItemsCalculatedData.push({
        uuid: seqItem.uuid,
        startSeconds: runningEvaSeconds,
        endSeconds:
          runningEvaSeconds + thisStationCalculatedFields.totalDwellTime.durationUpper * 60,
      });
      runningEvaSeconds += thisStationCalculatedFields.totalDwellTime.durationUpper * 60;
    } else if (thisTraverseCalculatedFields) {
      evaCalculatedFields.totalActionTime.durationLower +=
        thisTraverseCalculatedFields.totalActionTime.durationLower;
      evaCalculatedFields.totalActionTime.durationUpper +=
        thisTraverseCalculatedFields.totalActionTime.durationUpper;
      evaCalculatedFields.totalEv1Time.durationLower +=
        thisTraverseCalculatedFields.totalEv1Time.durationLower;
      evaCalculatedFields.totalEv1Time.durationUpper +=
        thisTraverseCalculatedFields.totalEv1Time.durationUpper;
      evaCalculatedFields.totalEv2Time.durationLower +=
        thisTraverseCalculatedFields.totalEv2Time.durationLower;
      evaCalculatedFields.totalEv2Time.durationUpper +=
        thisTraverseCalculatedFields.totalEv2Time.durationUpper;
      evaCalculatedFields.totalUnassignedTime.durationLower +=
        thisTraverseCalculatedFields.totalUnassignedTime.durationLower;
      evaCalculatedFields.totalUnassignedTime.durationUpper +=
        thisTraverseCalculatedFields.totalUnassignedTime.durationUpper;
      evaCalculatedFields.totalDwellTime.durationLower +=
        thisTraverseCalculatedFields.totalDwellTime.durationLower;
      evaCalculatedFields.totalDwellTime.durationUpper +=
        thisTraverseCalculatedFields.totalDwellTime.durationUpper;
      evaCalculatedFields.actionCount += thisTraverseCalculatedFields.actionCount;
      evaCalculatedFields.totalMass += thisTraverseCalculatedFields.totalMass;
      runningEvaSeconds += thisTraverseCalculatedFields.totalDwellTime.durationUpper * 60;

      evaCalculatedFields.totalTraverseTime += thisTraverseCalculatedFields.durationMinutes;
      evaCalculatedFields.totalTraverseDistanceMeters +=
        thisTraverseCalculatedFields.distanceMeters;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersClimbed;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersDescended;
      const totalTraverseDuration =
        (thisTraverseCalculatedFields.totalDwellTime.durationUpper +
          thisTraverseCalculatedFields.durationMinutes) *
        60;
      evaCalculatedFields.sequenceItemsCalculatedData.push({
        uuid: seqItem.uuid,
        startSeconds: runningEvaSeconds,
        endSeconds: runningEvaSeconds + totalTraverseDuration,
      });
      runningEvaSeconds += totalTraverseDuration;
    }
  }
  evaCalculatedFields.totalEvaTime.durationLower =
    evaCalculatedFields.totalDwellTime.durationLower +
    evaCalculatedFields.totalTraverseTime +
    eva.egressDuration +
    eva.ingressDuration;
  evaCalculatedFields.totalEvaTime.durationUpper =
    evaCalculatedFields.totalDwellTime.durationUpper +
    evaCalculatedFields.totalTraverseTime +
    eva.egressDuration +
    eva.ingressDuration;

  // check if max time exceeds limit

  // check if max time exceeds limit but is still within nominal
  if (
    eva.maxDuration &&
    evaCalculatedFields.totalEvaTime.durationUpper > eva.maxDuration &&
    evaCalculatedFields.totalEvaTime.durationLower <= eva.maxDuration
  ) {
    newReportItems.push({
      message:
        "Calculated max EVA duration exceeds defined maximum by " +
        (evaCalculatedFields.totalEvaTime.durationUpper - eva.maxDuration).toFixed(0) +
        " minutes but calculated nominal EVA duration is within limit",
      type: "warning",
    } as ReportItem);
  } else if (
    // check if max time exceeds limit and is also above nominal
    eva.maxDuration &&
    evaCalculatedFields.totalEvaTime.durationUpper > eva.maxDuration
  ) {
    newReportItems.push({
      message:
        "Calculated max EVA duration exceeds defined maximum by " +
        (evaCalculatedFields.totalEvaTime.durationUpper - eva.maxDuration).toFixed(0) +
        " minutes",
      type: "error",
    } as ReportItem);
  }
  // check if nominal time exceeds limit
  if (eva.maxDuration && evaCalculatedFields.totalEvaTime.durationLower > eva.maxDuration) {
    newReportItems.push({
      message:
        "Calculated nominal EVA duration exceeds defined maximum by " +
        (evaCalculatedFields.totalEvaTime.durationLower - eva.maxDuration).toFixed(0) +
        " minutes",
      type: "error",
    } as ReportItem);
  }

  evaCalculatedFields.reportItems = newReportItems;

  return evaCalculatedFields;
};
