import { calcPathDurationMins, calculateAscentAndDescent } from "utils/geoMath";
import { mergeEquipmentItems } from "utils/store";

export const getCalculatedFieldsByPoi = (params: {
  poiUuid: string;
  wholeStoreState: WholeStoreState;
}): PoiCalculatedFields => {
  const { poiUuid, wholeStoreState } = params;

  //get poi actions
  const poiActions = wholeStoreState.action.actions.filter(
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
  };

  return newCalculatedFields;
};

export const getCalculatedFieldsByStation = (params: {
  stationUuid: string;
  wholeStoreState: WholeStoreState;
}): StationCalculatedFields => {
  const { stationUuid, wholeStoreState } = params;
  const station = wholeStoreState.station.stations.find(
    (storeStation) => storeStation.uuid === stationUuid
  );
  const missionTraverseRate = wholeStoreState.mission.mission?.traverseRate;

  //get station actions
  const stationActions = wholeStoreState.action.actions.filter(
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
    missionTraverseRate
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
  };
  return newCalculatedFields;
};

export const getCalculatedFieldsByTraverse = (params: {
  traverseUuid: string;
  wholeStoreState: WholeStoreState;
}): TraverseCalculatedFields => {
  const { traverseUuid, wholeStoreState } = params;
  const traverse = wholeStoreState.traverse.traverses.find(
    (storeTraverse) => storeTraverse.uuid === traverseUuid
  );
  if (!traverse) return;
  const missionTraverseRate = wholeStoreState.mission.mission?.traverseRate;

  const newReportItems: ReportItem[] = [];

  // find the eva this traverse is used in
  const eva = wholeStoreState.eva.evas.find((eva) => {
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
      message: "Calculated traverse duration is under predicted nominal traverse time",
      type: "info",
    } as ReportItem);
  }

  // check if calculated duration is greater than predicted durationUpper
  if (traverse.predictedDurationUpper < durationMinutes) {
    newReportItems.push({
      message: "Calculated traverse duration is over predicted maximum traverse time",
      type: "error",
    } as ReportItem);
  }

  const newCalculatedFields: TraverseCalculatedFields = {
    uuid: traverse.uuid,
    reportItems: newReportItems,
    durationMinutes,
    distanceMeters,
    ascentDescent,
  };

  return newCalculatedFields;
};

export const getCalculatedFieldsByEva = (params: {
  evaUuid: string;
  wholeStoreState: WholeStoreState;
}): EvaCalculatedFields => {
  const { evaUuid, wholeStoreState } = params;
  const eva = wholeStoreState.eva.evas.find((storeEva) => storeEva.uuid === evaUuid);

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
  };

  let runningEvaSeconds = eva.egressDuration * 60; // start with egress duration
  for (const seqItem of evaSequence) {
    let thisStationCalculatedFields: StationCalculatedFields;
    let thisTraverseCalculatedFields: TraverseCalculatedFields;
    if (seqItem.type === "station") {
      thisStationCalculatedFields = getCalculatedFieldsByStation({
        stationUuid: seqItem.uuid,
        wholeStoreState,
      });
    } else if (seqItem.type === "traverse") {
      thisTraverseCalculatedFields = getCalculatedFieldsByTraverse({
        traverseUuid: seqItem.uuid,
        wholeStoreState,
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
      evaCalculatedFields.totalTraverseTime += thisTraverseCalculatedFields.durationMinutes;
      evaCalculatedFields.totalTraverseDistanceMeters +=
        thisTraverseCalculatedFields.distanceMeters;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersClimbed;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersDescended;
      evaCalculatedFields.sequenceItemsCalculatedData.push({
        uuid: seqItem.uuid,
        startSeconds: runningEvaSeconds,
        endSeconds: runningEvaSeconds + thisTraverseCalculatedFields.durationMinutes * 60,
      });
      runningEvaSeconds += thisTraverseCalculatedFields.durationMinutes * 60;
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
