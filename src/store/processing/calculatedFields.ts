import { calcPathDurationMins, calculateAscentAndDescent } from "utils/mapping/geoMath";
import { mergeEquipmentItems } from "store/storeUtils/store";
import { isNotNumber } from "utils/formatting";
import { getBearingFromLatLngPoints } from "utils/surf-nav/surfNavWrapper";

type CalculatedActionFields = {
  totalDuration: number;
  totalEv1Duration: number;
  totalEv2Duration: number;
  totalUnassignedDuration: number;
  totalDwellTime: number;
  actionCount: number;
  totalMass: number;
  totalEquipmentItems: EquipmentItemUsages;
};

export const getCalculatedFieldsByPoi = (params: {
  poiUuid: string;
  poiActions: Action[];
}): PoiCalculatedFields => {
  const { poiUuid, poiActions } = params;

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

// Function to calculate all necessary fields for actions
const calcActionsFields = (actions: Action[]): CalculatedActionFields => {
  let totalDuration = 0;
  let totalEv1Duration = 0;
  let totalEv2Duration = 0;
  let totalUnassignedDuration = 0;
  let totalDwellTime = 0;
  let totalMass = 0;
  let actionCount = 0;
  let totalEquipmentItems: EquipmentItemUsages = {};
  actions.forEach((action) => {
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
  return {
    totalDuration,
    totalEv1Duration,
    totalEv2Duration,
    totalUnassignedDuration,
    totalDwellTime,
    actionCount,
    totalMass,
    totalEquipmentItems,
  };
};

const calcTraverseEffectiveRate = (
  traverse: Traverse,
  missionTraverseRate: number,
  evaTraverseRate?: number
): number => {
  let traverseRate = missionTraverseRate;
  if (evaTraverseRate) {
    traverseRate = evaTraverseRate;
  }
  if (traverse.traverseRate) {
    traverseRate = traverse.traverseRate;
  }
  return traverseRate;
};

export const getCalculatedFieldsByStation = (params: {
  station: Station;
  missionWalkbackRate: number;
  stationActions: Action[];
}): StationCalculatedFields => {
  const { station, missionWalkbackRate, stationActions } = params;

  //calculate total station time
  const {
    totalDuration,
    totalEv1Duration,
    totalEv2Duration,
    totalUnassignedDuration,
    totalDwellTime,
    actionCount,
    totalMass,
    totalEquipmentItems,
  } = calcActionsFields(stationActions);

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

  // get walkback duration minutes
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
  traverse: Traverse;
  missionTraverseRate: number;
  evaTraverseRate: number;
  traverseActions: Action[];
}): TraverseCalculatedFields => {
  const { traverse, missionTraverseRate, evaTraverseRate, traverseActions } = params;
  if (!traverse) return;

  //calculate total traverse action time
  const {
    totalDuration: actionTotalDuration,
    totalEv1Duration,
    totalEv2Duration,
    totalUnassignedDuration,
    totalDwellTime,
    actionCount,
    totalMass,
  } = calcActionsFields(traverseActions);

  const newReportItems: ReportItem[] = [];

  // get duration minutes
  const traverseRate = calcTraverseEffectiveRate(traverse, missionTraverseRate, evaTraverseRate);
  const traverseDurationMins = calcPathDurationMins(traverse.pathSegmentDistances, traverseRate);

  // get distance meters
  const distanceMeters = traverse.pathSegmentDistances?.reduce(
    (accumulator, currentVal) => accumulator + currentVal,
    0
  );

  // total ascended and descended
  const ascentDescent = calculateAscentAndDescent(traverse.pathSegmentElevations);

  // get traverse segment bearings
  const pathSegmentBearings: number[] = [];
  for (let i = 1; i < traverse.path.length; i++) {
    const bearing = getBearingFromLatLngPoints(traverse.path[i - 1], traverse.path[i]);
    pathSegmentBearings.push(bearing);
  }

  // check if calculated duration is greater than predicted durationLower
  if (!isNotNumber(traverse?.duration)) {
    if (traverse?.duration > (Math.ceil(traverseDurationMins) + actionTotalDuration) * 1.25) {
      newReportItems.push({
        message:
          "Traverse duration is significantly more than the calculated total duration of actions and movement",
        type: "warning",
      } as ReportItem);
    } else if (traverse?.duration > Math.ceil(traverseDurationMins) + actionTotalDuration * 1.1) {
      newReportItems.push({
        message:
          "Traverse duration is more than the calculated total duration of actions and movement",
        type: "warning",
      } as ReportItem);
    } else if (
      traverse?.duration <
      (Math.ceil(traverseDurationMins) + actionTotalDuration) * 0.75
    ) {
      newReportItems.push({
        message:
          "Traverse duration is significantly less than the calculated total duration of actions and movement",
        type: "warning",
      } as ReportItem);
    } else if (traverse?.duration < Math.ceil(traverseDurationMins) + actionTotalDuration * 0.9) {
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
    totalActionTime: actionTotalDuration,
    totalEv1Time: totalEv1Duration,
    totalEv2Time: totalEv2Duration,
    totalUnassignedTime: totalUnassignedDuration,
    totalDwellTime: totalDwellTime,
    actionCount,
    totalMass,
    durationMinutes: traverseDurationMins,
    distanceMeters,
    ascentDescent,
    bearings: pathSegmentBearings,
  };

  return newCalculatedFields;
};

// Smaller function to only calculate necessary fields that Maestro needs
// when sending data over sockets
export const getMaestroCalculatedFieldsForStation = (
  stationActions: Action[]
): { totalDwellTime: number } => {
  const { totalDwellTime } = calcActionsFields(stationActions);
  return { totalDwellTime };
};

// Smaller function to only calculate necessary fields that Maestro needs
// when sending data over sockets
export const getMaestroCalculatedFieldsForTraverse = (params: {
  traverse: Traverse;
  missionTraverseRate: number;
  evaTraverseRate?: number;
  traverseActions: Action[];
}): { totalDwellTime: number; durationMinutes: number } => {
  const { traverse, missionTraverseRate, evaTraverseRate, traverseActions } = params;
  const { totalDwellTime } = calcActionsFields(traverseActions);
  const traverseRate = calcTraverseEffectiveRate(traverse, missionTraverseRate, evaTraverseRate);
  const durationMinutes = calcPathDurationMins(traverse.pathSegmentDistances, traverseRate);
  return { totalDwellTime, durationMinutes };
};

export const getCalculatedTimeOfSequenceItem = (params: {
  evaUuid: string;
  sequenceItemUuid: string;
  evas: Eva[];
  stations: Station[];
  actions: Action[];
  traverses: Traverse[];
  missionWalkbackRate: number;
  missionTraverseRate: number;
}): string => {
  const {
    evaUuid,
    sequenceItemUuid,
    evas,
    stations,
    actions,
    traverses,
    missionWalkbackRate,
    missionTraverseRate,
  } = params;
  const eva = evas.find((storeEva) => storeEva.uuid === evaUuid);

  if (!eva || !sequenceItemUuid || !eva.datetime) return;

  // get eva start time
  const evaStartTimeNumeric = eva.datetime;
  // go through eva sequence and calculate things
  const evaSequence = eva.sequence;

  let runningEvaSeconds = eva.egressDuration * 60; // start with egress duration
  let halfTime = 0;
  for (const seqItem of evaSequence) {
    let thisTraverseCalculatedTime: number;
    let thisStationCalculatedTime: number;
    if (seqItem.type === "station") {
      const station = stations.find((station) => station.uuid === seqItem.uuid);
      let stationActions: Action[] = [];
      if (station) {
        stationActions = actions.filter((a) => a.stationUuid === station.uuid && a.enabled);
      }
      thisStationCalculatedTime = getCalculatedFieldsByStation({
        station,
        missionWalkbackRate,
        stationActions,
      }).totalDwellTime;
    } else if (seqItem.type === "traverse") {
      const traverse = traverses.find((traverse) => traverse.uuid === seqItem.uuid);
      const traverseEva = evas.find((eva) =>
        eva.sequence.some((seqItem) => seqItem.uuid === traverse.uuid)
      );
      let traverseActions: Action[] = [];
      if (traverse) {
        traverseActions = actions.filter((a) => a.traverseUuid === traverse.uuid && a.enabled);
      }
      thisTraverseCalculatedTime = getCalculatedFieldsByTraverse({
        traverse,
        missionTraverseRate,
        evaTraverseRate: traverseEva?.traverseRate,
        traverseActions,
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
  eva: Eva;
  evaStations: Station[];
  missionWalkbackRate: number;
  missionTraverseRate: number;
  evaActions: Action[];
  evaTraverses: Traverse[];
}): EvaCalculatedFields => {
  const { eva, evaStations, missionWalkbackRate, missionTraverseRate, evaActions, evaTraverses } =
    params;

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
    equipmentItems: {},
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
      thisStation = evaStations.find((station) => station.uuid === seqItem.uuid);
      let stationActions: Action[] = [];
      if (thisStation) {
        stationActions = evaActions.filter((a) => a.stationUuid === thisStation.uuid && a.enabled);
      }
      thisStationCalculatedFields = getCalculatedFieldsByStation({
        station: thisStation,
        missionWalkbackRate,
        stationActions,
      });
    } else if (seqItem.type === "traverse") {
      thisTraverse = evaTraverses.find((traverse) => traverse.uuid === seqItem.uuid);
      let traverseActions: Action[] = [];
      if (thisTraverse) {
        traverseActions = evaActions.filter(
          (a) => a.traverseUuid === thisTraverse.uuid && a.enabled
        );
      }
      thisTraverseCalculatedFields = getCalculatedFieldsByTraverse({
        traverse: thisTraverse,
        missionTraverseRate,
        evaTraverseRate: eva.traverseRate,
        traverseActions,
      });
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

  // check if nominal time exceeds limit
  if (eva.duration && evaCalculatedFields.totalEvaTime > eva.duration) {
    newReportItems.push({
      message:
        "Calculated EVA duration exceeds set EVA duration by " +
        Math.ceil(evaCalculatedFields.totalEvaTime - eva.duration) +
        " minutes",
      type: "warning",
    } as ReportItem);
  }

  evaCalculatedFields.reportItems = newReportItems;

  return evaCalculatedFields;
};
