import {
  calcPathDurationMins,
  calculateAscentAndDescent,
  getSegmentBearing,
} from "utils/mapping/geoMath";
import { mergeEquipmentItems } from "store/storeUtils/store";
import { isNotNumber } from "utils/formatting";

export const getCalcFieldsForPoi = (params: {
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
  let totalEquipmentItems: EquipmentItemUsages = {};
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
    totalEquipmentItems = mergeEquipmentItems(action.equipmentItemsUsage, totalEquipmentItems);
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
    totalEquipmentItems,
  };

  return newCalculatedFields;
};

// Function to calculate all necessary fields for actions
const getCalcFieldsForActions = (actions: Action[]): ActionsCalculatedFields => {
  let totalActionTime = 0;
  let totalEv1Time = 0;
  let totalEv2Time = 0;
  let totalUnassignedTime = 0;
  let totalDwellTime = 0;
  let totalMass = 0;
  let actionCount = 0;
  let totalEquipmentItems: EquipmentItemUsages = {};
  actions.forEach((action) => {
    totalActionTime += action.duration;
    if (action.crewAssigned?.includes("EV1")) {
      totalEv1Time += action.duration;
    }
    if (action.crewAssigned?.includes("EV2")) {
      totalEv2Time += action.duration;
    }
    if (!action.crewAssigned || action.crewAssigned.length === 0) {
      totalUnassignedTime += action.duration;
    }
    totalDwellTime = totalEv1Time > totalEv2Time ? totalEv1Time : totalEv2Time;
    totalEquipmentItems = mergeEquipmentItems(action.equipmentItemsUsage, totalEquipmentItems);
    actionCount++;
    totalMass += action.mass;
  });
  return {
    totalActionTime,
    totalEv1Time,
    totalEv2Time,
    totalUnassignedTime,
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

export const getCalcFieldsForStation = (params: {
  station: Station;
  missionWalkbackRate: number;
  stationActions: Action[];
}): StationCalculatedFields => {
  const { station, missionWalkbackRate, stationActions } = params;

  //calculate total station time
  const {
    totalActionTime,
    totalEv1Time,
    totalEv2Time,
    totalUnassignedTime,
    totalDwellTime,
    actionCount,
    totalMass,
    totalEquipmentItems,
  } = getCalcFieldsForActions(stationActions);

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
  if (totalUnassignedTime > 0) {
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
    totalActionTime,
    totalEv1Time,
    totalEv2Time,
    totalUnassignedTime,
    totalDwellTime: totalDwellTime,
    actionCount,
    walkbackMovementDurationMinutes: walkbackDurationMinutes,
    walkbackDistanceMeters,
    walkbackAscentDescent,
    totalEquipmentItems,
    totalMass,
  };
  return newCalculatedFields;
};

export const getCalcFieldsForTraverse = (params: {
  traverse: Traverse;
  missionTraverseRate: number;
  evaTraverseRate: number;
  traverseActions: Action[];
  // Coordinate frame for segment bearings. Defaults to LPS grid (lunar) so the
  // internal EVA/timeline callers — which only read duration/distance, never
  // bearings — keep their existing behaviour. Display callers (traverse info
  // panel) pass the mission flag so Earth missions get true-north azimuths.
  usingLGRSCoordinates?: boolean;
}): TraverseCalculatedFields => {
  const {
    traverse,
    missionTraverseRate,
    evaTraverseRate,
    traverseActions,
    usingLGRSCoordinates = true,
  } = params;
  if (!traverse) return;

  //calculate total traverse action time
  const {
    totalActionTime: actionTotalDuration,
    totalEv1Time,
    totalEv2Time,
    totalUnassignedTime,
    totalDwellTime,
    actionCount,
    totalMass,
    totalEquipmentItems,
  } = getCalcFieldsForActions(traverseActions);

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
    const bearing = getSegmentBearing(traverse.path[i - 1], traverse.path[i], usingLGRSCoordinates);
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
    totalEv1Time,
    totalEv2Time,
    totalUnassignedTime,
    totalDwellTime: totalDwellTime,
    actionCount,
    totalMass,
    totalEquipmentItems,
    movementDurationMinutes: traverseDurationMins,
    distanceMeters,
    ascentDescent,
    bearings: pathSegmentBearings,
  };

  return newCalculatedFields;
};

export const getCalcTimeForSequenceItem = (params: {
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

  let runningEvaSeconds = 0;
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
      thisStationCalculatedTime = getCalcFieldsForStation({
        station,
        missionWalkbackRate,
        stationActions,
      })?.totalDwellTime;
    } else if (seqItem.type === "traverse") {
      const traverse = traverses.find((traverse) => traverse.uuid === seqItem.uuid);
      const traverseEva = evas.find((eva) =>
        eva.sequence.some((item) => item.uuid === traverse?.uuid)
      );
      let traverseActions: Action[] = [];
      if (traverse) {
        traverseActions = actions.filter((a) => a.traverseUuid === traverse.uuid && a.enabled);
      }
      thisTraverseCalculatedTime = getCalcFieldsForTraverse({
        traverse,
        missionTraverseRate,
        evaTraverseRate: traverseEva?.traverseRate,
        traverseActions,
      })?.movementDurationMinutes;
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

export const getCalcFieldsForEva = (params: {
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

    // action fields
    totalActionTime: 0,
    totalEv1Time: 0,
    totalEv2Time: 0,
    totalUnassignedTime: 0,
    totalDwellTime: 0,
    actionCount: 0,
    totalMass: 0,
    totalEquipmentItems: {},

    // traverse
    totalTraverseMovementTime: 0,
    totalTraverseDistanceMeters: 0,
    totalTraverseAscentDescent: {
      totalMetersClimbed: 0,
      totalMetersDescended: 0,
    },

    // resolved durations
    totalResolvedEvaTime: 0,
    totalResolvedStationTime: 0,
    totalResolvedTraverseTime: 0,

    // sequence items calculated data
    sequenceItemsCalculatedData: [],
  };

  let runningEvaSeconds = 0;
  let manualEvaSeconds = 0;
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
      thisStationCalculatedFields = getCalcFieldsForStation({
        station: thisStation,
        missionWalkbackRate,
        stationActions,
      });

      // A sequence item can hold an empty uuid while the user is still picking
      // a station, so there is nothing to total up for this item yet.
      if (!thisStationCalculatedFields) continue;

      // Add in all the calc action fields from this sequence
      evaCalculatedFields.totalActionTime += thisStationCalculatedFields.totalActionTime;
      evaCalculatedFields.totalEv1Time += thisStationCalculatedFields.totalEv1Time;
      evaCalculatedFields.totalEv2Time += thisStationCalculatedFields.totalEv2Time;
      evaCalculatedFields.totalUnassignedTime += thisStationCalculatedFields.totalUnassignedTime;
      evaCalculatedFields.totalDwellTime += thisStationCalculatedFields.totalDwellTime;
      evaCalculatedFields.actionCount += thisStationCalculatedFields.actionCount;
      evaCalculatedFields.totalMass += thisStationCalculatedFields.totalMass;
      evaCalculatedFields.totalEquipmentItems = mergeEquipmentItems(
        thisStationCalculatedFields.totalEquipmentItems,
        evaCalculatedFields.totalEquipmentItems
      );

      // Either the calculated duration or if overridden by the manual field
      // then it shows the manual estimated duration
      const resolvedStationDurationMins = !isNotNumber(thisStation?.duration)
        ? thisStation.duration
        : thisStationCalculatedFields.totalDwellTime;
      evaCalculatedFields.totalResolvedEvaTime += Math.ceil(resolvedStationDurationMins);
      evaCalculatedFields.totalResolvedStationTime += Math.ceil(resolvedStationDurationMins);

      // Set the sequence item calculated data
      evaCalculatedFields.sequenceItemsCalculatedData.push({
        uuid: seqItem.uuid,
        startSeconds: runningEvaSeconds,
        endSeconds: runningEvaSeconds + thisStationCalculatedFields.totalDwellTime * 60,
        manualStartSeconds: manualEvaSeconds,
        manualEndSeconds: manualEvaSeconds + resolvedStationDurationMins * 60,
        resolvedDurationMins: resolvedStationDurationMins,
      });
      runningEvaSeconds += thisStationCalculatedFields.totalDwellTime * 60;
      manualEvaSeconds += resolvedStationDurationMins * 60;
    } else if (seqItem.type === "traverse") {
      thisTraverse = evaTraverses.find((traverse) => traverse.uuid === seqItem.uuid);
      let traverseActions: Action[] = [];
      if (thisTraverse) {
        traverseActions = evaActions.filter(
          (a) => a.traverseUuid === thisTraverse.uuid && a.enabled
        );
      }
      thisTraverseCalculatedFields = getCalcFieldsForTraverse({
        traverse: thisTraverse,
        missionTraverseRate,
        evaTraverseRate: eva.traverseRate,
        traverseActions,
      });

      // Same as above: an unresolved traverse contributes nothing.
      if (!thisTraverseCalculatedFields) continue;

      // Add in all the calc action fields from this sequence
      evaCalculatedFields.totalActionTime += thisTraverseCalculatedFields.totalActionTime;
      evaCalculatedFields.totalEv1Time += thisTraverseCalculatedFields.totalEv1Time;
      evaCalculatedFields.totalEv2Time += thisTraverseCalculatedFields.totalEv2Time;
      evaCalculatedFields.totalUnassignedTime += thisTraverseCalculatedFields.totalUnassignedTime;
      evaCalculatedFields.totalDwellTime += thisTraverseCalculatedFields.totalDwellTime;
      evaCalculatedFields.actionCount += thisTraverseCalculatedFields.actionCount;
      evaCalculatedFields.totalMass += thisTraverseCalculatedFields.totalMass;
      runningEvaSeconds += thisTraverseCalculatedFields.totalDwellTime * 60;
      evaCalculatedFields.totalEquipmentItems = mergeEquipmentItems(
        thisTraverseCalculatedFields.totalEquipmentItems,
        evaCalculatedFields.totalEquipmentItems
      );

      // Add in all the traverse-specific calculated fields for the eva
      evaCalculatedFields.totalTraverseMovementTime +=
        thisTraverseCalculatedFields.movementDurationMinutes;
      evaCalculatedFields.totalTraverseDistanceMeters +=
        thisTraverseCalculatedFields.distanceMeters;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersClimbed;
      evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended +=
        thisTraverseCalculatedFields.ascentDescent.totalMetersDescended;
      // Traverse action time + movement time
      const totalCalcTraverseDurationMins =
        thisTraverseCalculatedFields.totalDwellTime +
        thisTraverseCalculatedFields.movementDurationMinutes;

      // Either the calculated duration or if overridden by the manual field
      // then it shows the manual estimated duration
      const resolvedTraverseDurationMins = !isNotNumber(thisTraverse?.duration)
        ? thisTraverse.duration
        : totalCalcTraverseDurationMins;
      evaCalculatedFields.totalResolvedEvaTime += Math.ceil(resolvedTraverseDurationMins);
      evaCalculatedFields.totalResolvedTraverseTime += Math.ceil(resolvedTraverseDurationMins);

      // Set the sequence item calculated data
      evaCalculatedFields.sequenceItemsCalculatedData.push({
        uuid: seqItem.uuid,
        startSeconds: runningEvaSeconds,
        endSeconds: runningEvaSeconds + totalCalcTraverseDurationMins * 60,
        manualStartSeconds: manualEvaSeconds,
        manualEndSeconds: manualEvaSeconds + resolvedTraverseDurationMins * 60,
        resolvedDurationMins: resolvedTraverseDurationMins,
      });
      runningEvaSeconds += totalCalcTraverseDurationMins * 60;
      manualEvaSeconds += resolvedTraverseDurationMins * 60;
    }
  }

  // check if nominal time exceeds limit
  if (eva.duration && evaCalculatedFields.totalResolvedEvaTime > eva.duration) {
    newReportItems.push({
      message:
        "Calculated EVA duration exceeds set EVA duration by " +
        Math.ceil(evaCalculatedFields.totalResolvedEvaTime - eva.duration) +
        " minutes",
      type: "warning",
    } as ReportItem);
  }

  evaCalculatedFields.reportItems = newReportItems;

  return evaCalculatedFields;
};

// Smaller function to only calculate necessary fields that Maestro needs
// when sending data over sockets
export const getMaestroCalcFieldsForStation = (
  stationActions: Action[]
): { totalDwellTime: number } => {
  const { totalDwellTime } = getCalcFieldsForActions(stationActions);
  return { totalDwellTime };
};

// Smaller function to only calculate necessary fields that Maestro needs
// when sending data over sockets
export const getMaestroCalcFieldsForTraverse = (params: {
  traverse: Traverse;
  missionTraverseRate: number;
  evaTraverseRate?: number;
  traverseActions: Action[];
}): { totalDwellTime: number; durationMinutes: number } => {
  const { traverse, missionTraverseRate, evaTraverseRate, traverseActions } = params;
  const { totalDwellTime } = getCalcFieldsForActions(traverseActions);
  const traverseRate = calcTraverseEffectiveRate(traverse, missionTraverseRate, evaTraverseRate);
  const durationMinutes = calcPathDurationMins(traverse.pathSegmentDistances, traverseRate);
  return { totalDwellTime, durationMinutes };
};
