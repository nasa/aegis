import isNumber from "lodash/isNumber";
import type { MutableRefObject } from "react";
import { isNotNumber } from "utils/formatting";
import { addPointsAtMeters, getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

/**
 * Populate storeRefs with all our store information so paper.js can read it.
 * Perform additional calculations required for drawing, such as subdividing any paths
 */
export const processEvaDataFromStore = ({
  storeRef,
  partialMission,
  selectedEva,
  evaStations,
  evaTraverses,
  stationCalculatedFieldsInSelectedEva,
  traverseCalculatedFieldsInSelectedEva,
  selectedRex,
}: {
  storeRef: MutableRefObject<EvaCalculated_PaperJS>;
  partialMission: Pick<
    Mission,
    | "walkbackRate"
    | "traverseRate"
    | "demResolution"
    | "landerElevationMeters"
    | "landerLocation"
    | "planetRadius"
    | "defaultEvaDuration"
  >;
  selectedEva: Eva;
  evaStations: Station[];
  evaTraverses: Traverse[];
  stationCalculatedFieldsInSelectedEva: StationCalculatedFields[];
  traverseCalculatedFieldsInSelectedEva: TraverseCalculatedFields[];
  selectedRex: Rex;
}): void => {
  storeRef.current = {
    sequenceItems: [],
    selectedEvaSequenceItemUuid: null,
    maxDistFromLanderMeters: 0,
    evaLengthMins: selectedEva?.duration
      ? +selectedEva?.duration
      : +partialMission?.defaultEvaDuration,
    evaLengthCalculatedMins: 0,
    maxElevationMeters: null,
    minElevationMeters: null,
    landerElevationMeters: null,
    elevationResolutionMeters: null,
  };

  if (!selectedEva?.sequence || !partialMission) return;
  storeRef.current.elevationResolutionMeters = partialMission.demResolution;
  storeRef.current.landerElevationMeters = partialMission.landerElevationMeters;

  for (const sequenceItem of selectedEva.sequence) {
    const EVASequenceItemForTimeline: EVASequenceItemForTimeline = {
      ...sequenceItem,
      name: null,
      secondsStart: storeRef.current.evaLengthCalculatedMins * 60,
      totalDurationMins: null,
      traverseRateMSec: null,
      icon: null,
    };

    // Get station or traverse
    if (sequenceItem.type === "station") {
      const station = evaStations.find((s) => s?.uuid === sequenceItem.uuid);
      if (!station) continue; // Skip if station doesn't exist (happens when station hasn't been selected yet when editing sequence)

      EVASequenceItemForTimeline.name = station.name;
      EVASequenceItemForTimeline.stationElevation = station.elevation ? station.elevation : null;
      EVASequenceItemForTimeline.icon = station.icon;

      // Get traverse rate for this sequence item in meters per second (eva rate falling back to mission rate)
      const traverseRate = isNumber(selectedEva.traverseRate)
        ? selectedEva.traverseRate
        : partialMission.traverseRate;
      EVASequenceItemForTimeline.traverseRateMSec = traverseRate * (1000 / 3600); // Convert to m/sec

      // Get calculatedFieldValues for this station
      const stationCalculatedFields = stationCalculatedFieldsInSelectedEva.find(
        (calculated) => calculated?.uuid === station.uuid
      );

      // Calculate duration from actions assigned to station
      // Note: this is the "dwell time" which is crew member time spent at the station that is the longest
      // Can be overridden by a manual duration
      const resolvedDurationMinutes = isNotNumber(station?.duration)
        ? stationCalculatedFields?.totalDwellTime
        : station.duration;

      EVASequenceItemForTimeline.totalDurationMins = resolvedDurationMinutes;
      storeRef.current.evaLengthCalculatedMins += resolvedDurationMinutes; // Add to sum for total length calculated

      if (partialMission.landerLocation) {
        // Calculate distance to lander
        const landerDistance = getDistanceBetweenTwoCoordinates(
          station.location,
          partialMission.landerLocation,
          partialMission.planetRadius
        );

        if (landerDistance > storeRef.current.maxDistFromLanderMeters)
          storeRef.current.maxDistFromLanderMeters = landerDistance;
        EVASequenceItemForTimeline.stationDistFromLanderMeters = landerDistance;

        // Calculate walkback path if this station has a walkback
        if (station.walkbackPath) {
          const walkback: Path_PaperJS = {
            subdividedPath: null,
            subdividedDistMeters: [],
            subdividedDurationsMins: [],
            subdividedDistFromLanderMeters: [],
            segmentedElevationMeters: station.walkbackPathSegmentElevations,
            segmentedDistancesMeters: station.walkbackPathSegmentDistances,
          };

          // Find max/min of elevation
          if (station.walkbackPathSegmentElevations) {
            for (const elevationSegment of station.walkbackPathSegmentElevations) {
              for (const elevation of elevationSegment) {
                if (
                  !storeRef.current.maxElevationMeters ||
                  storeRef.current.maxElevationMeters < elevation
                ) {
                  storeRef.current.maxElevationMeters = elevation;
                }
                if (
                  !storeRef.current.minElevationMeters ||
                  storeRef.current.minElevationMeters > elevation
                ) {
                  storeRef.current.minElevationMeters = elevation;
                }
              }
            }
          }

          // Subdivide each segment by for greater accuracy
          const divisor = stationCalculatedFields.walkbackDistanceMeters * 0.01; //meters
          const newWalkbackPath: AEGISPoint[] = addPointsAtMeters(
            station.walkbackPath,
            divisor,
            partialMission.planetRadius
          );
          walkback.subdividedPath = newWalkbackPath;

          // Loop through new subdivided walkback path
          for (let i = 0; i < newWalkbackPath.length; i++) {
            // Calculate distance from lander. Track max distance
            const landerDistance = getDistanceBetweenTwoCoordinates(
              newWalkbackPath[i],
              partialMission.landerLocation,
              partialMission.planetRadius
            );

            if (landerDistance > storeRef.current.maxDistFromLanderMeters)
              storeRef.current.maxDistFromLanderMeters = landerDistance;
            walkback.subdividedDistFromLanderMeters.push(landerDistance);

            // Calculate duration. distance is in m, rate is in km/h, duration is in minutes
            if (i !== newWalkbackPath.length - 1) {
              const distanceSegment = getDistanceBetweenTwoCoordinates(
                newWalkbackPath[i],
                newWalkbackPath[i + 1],
                partialMission.planetRadius
              );
              walkback.subdividedDistMeters.push(distanceSegment);
              const walkbackTraverseRate = isNumber(station.walkbackTraverseRate)
                ? station.walkbackTraverseRate
                : partialMission.walkbackRate;

              const duration = isNaN(walkbackTraverseRate)
                ? 0
                : (distanceSegment / (+walkbackTraverseRate * 1000)) * 60;
              walkback.subdividedDurationsMins.push(duration);
            }
          }

          // Set walkback data
          EVASequenceItemForTimeline.stationWalkback = walkback;
        }
      }
    } else if (sequenceItem.type === "traverse") {
      const traverse = evaTraverses.find((t) => t?.uuid === sequenceItem?.uuid);

      if (!traverse || traverse?.path?.length < 2) continue; // Skip traverses with less than 2 points
      EVASequenceItemForTimeline.name = traverse.name;
      EVASequenceItemForTimeline.traverse = {
        subdividedPath: null,
        subdividedDistMeters: [],
        subdividedDistFromLanderMeters: [],
        segmentedDistancesMeters: traverse.pathSegmentDistances,
        segmentedElevationMeters: traverse.pathSegmentElevations,
      };

      // Set the traverse rate for the sequence item in meters per second
      // (traverse field value, falling back to eva rate, falling back to mission rate)
      const traverseRate =
        traverse.traverseRate || selectedEva.traverseRate || partialMission.traverseRate;
      EVASequenceItemForTimeline.traverseRateMSec = traverseRate * (1000 / 3600);

      // Find max/min of elevation
      if (traverse.pathSegmentElevations) {
        for (const elevationSegment of traverse.pathSegmentElevations) {
          for (const elevation of elevationSegment) {
            if (
              !storeRef.current.maxElevationMeters ||
              storeRef.current.maxElevationMeters < elevation
            ) {
              storeRef.current.maxElevationMeters = elevation;
            }
            if (
              !storeRef.current.minElevationMeters ||
              storeRef.current.minElevationMeters > elevation
            ) {
              storeRef.current.minElevationMeters = elevation;
            }
          }
        }
      }
      // Get calculatedFieldValues for this traverse
      const calculatedFields = traverseCalculatedFieldsInSelectedEva.find(
        (calculated) => calculated?.uuid === traverse.uuid
      );

      // Subdivide each traverse segment for greater accuracy
      const divisor = calculatedFields.distanceMeters * 0.01; //meters
      const newTraverse: AEGISPoint[] = addPointsAtMeters(
        traverse.path,
        divisor,
        partialMission.planetRadius
      );
      EVASequenceItemForTimeline.traverse.subdividedPath = newTraverse;

      const durationIsManual = !isNotNumber(traverse.duration);

      // Loop through new subdivided traverse
      let calculatedDuration = 0;
      for (let i = 0; i < newTraverse.length; i++) {
        if (partialMission.landerLocation) {
          // Calculate distance from lander. Track max distance
          const landerDistance = getDistanceBetweenTwoCoordinates(
            newTraverse[i],
            partialMission.landerLocation,
            partialMission.planetRadius
          );
          if (landerDistance > storeRef.current.maxDistFromLanderMeters)
            storeRef.current.maxDistFromLanderMeters = landerDistance;
          EVASequenceItemForTimeline.traverse.subdividedDistFromLanderMeters.push(landerDistance);
        }

        // Calculate duration. distance is in m, rate is in km/h, duration is in minutes
        if (i !== newTraverse.length - 1) {
          const distanceSegment = getDistanceBetweenTwoCoordinates(
            newTraverse[i],
            newTraverse[i + 1],
            partialMission.planetRadius
          );
          EVASequenceItemForTimeline.traverse.subdividedDistMeters.push(distanceSegment);
          if (!durationIsManual) {
            const duration = isNaN(traverseRate)
              ? 0
              : (distanceSegment / (+traverseRate * 1000)) * 60;
            calculatedDuration += duration;
          }
        }
      }

      if (durationIsManual) {
        // Assign total duration for the traverse and add it to the eva total duration
        EVASequenceItemForTimeline.totalDurationMins = traverse.duration;
        storeRef.current.evaLengthCalculatedMins += traverse.duration;
      } else {
        // Add traverse action durations onto the total duration for the traverse
        // note: this is the "dwell time"
        const actionDurationMins = calculatedFields?.totalDwellTime;
        const calcTraversePlusActionDuration = Math.ceil(calculatedDuration) + actionDurationMins;

        // Assign total duration for the traverse and add it to the eva total duration
        EVASequenceItemForTimeline.totalDurationMins = calcTraversePlusActionDuration;
        storeRef.current.evaLengthCalculatedMins += calcTraversePlusActionDuration;
      }
    }
    storeRef.current.sequenceItems.push(EVASequenceItemForTimeline);
  }

  // Loop through any crew positions (for rex) to check max graph ranges
  if (!selectedRex?.posEntries) return;
  for (const posEntry of selectedRex.posEntries) {
    if (!posEntry.location) continue; //new crew pos don't have location yet
    const newDistance = +getDistanceBetweenTwoCoordinates(
      posEntry.location,
      partialMission.landerLocation,
      partialMission.planetRadius
    ).toFixed(2);
    if (newDistance > storeRef.current.maxDistFromLanderMeters)
      storeRef.current.maxDistFromLanderMeters = newDistance;
  }
};
