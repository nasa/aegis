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
    egressDurationMins: null,
    ingressDurationMins: null,
  };

  if (!selectedEva?.sequence || !partialMission) return;
  storeRef.current.elevationResolutionMeters = partialMission.demResolution;
  storeRef.current.landerElevationMeters = partialMission.landerElevationMeters;

  //add fake sequence items for egress and ingress
  const egressSequenceItem: EvaSequenceItem = {
    uuid: "egress",
    type: "station",
  };
  const ingressSequenceItem: EvaSequenceItem = {
    uuid: "ingress",
    type: "station",
  };

  //add egress and ingress to the sequence
  const sequenceWithLander = [egressSequenceItem, ...selectedEva.sequence, ingressSequenceItem];

  //loop through sequence items
  for (const sequenceItem of sequenceWithLander) {
    const EVASequenceItemForTimeline: EVASequenceItemForTimeline = {
      ...sequenceItem,
      name: null,
      secondsStart: storeRef.current.evaLengthCalculatedMins * 60,
      totalDurationMins: null,
      traverseRateMSec: null,
      icon: null,
    };

    //get station or traverse
    if (sequenceItem.type === "station") {
      // special case if the station is egress or ingress inserted into the sequence above
      if (sequenceItem.uuid === "egress") {
        EVASequenceItemForTimeline.name = "Egress";
        EVASequenceItemForTimeline.totalDurationMins = selectedEva.egressDuration;
        storeRef.current.egressDurationMins = selectedEva.egressDuration;
        storeRef.current.evaLengthCalculatedMins += selectedEva.egressDuration; //add to sum for total length calculated
        EVASequenceItemForTimeline.stationElevation = partialMission.landerElevationMeters;
        EVASequenceItemForTimeline.stationDistFromLanderMeters = 0;
        EVASequenceItemForTimeline.stationWalkback = null;
        // get egress location from eva. If station, set the icon to the station icon, otherwise set it to null
        let egressIcon = null;
        if (selectedEva.egressLocationUuid !== "lander") {
          const egressStation = evaStations.find((s) => s.uuid === selectedEva.egressLocationUuid);
          egressIcon = egressStation ? egressStation.icon : null;
        }
        EVASequenceItemForTimeline.icon = egressIcon; // replaced at render time with lander image
      } else if (sequenceItem.uuid === "ingress") {
        EVASequenceItemForTimeline.name = "Ingress";
        EVASequenceItemForTimeline.totalDurationMins = selectedEva.ingressDuration;
        storeRef.current.ingressDurationMins = selectedEva.ingressDuration;
        storeRef.current.evaLengthCalculatedMins += selectedEva.ingressDuration; //add to sum for total length calculated
        EVASequenceItemForTimeline.stationElevation = partialMission.landerElevationMeters;
        EVASequenceItemForTimeline.stationDistFromLanderMeters = 0;
        EVASequenceItemForTimeline.stationWalkback = null;
        // get ingress location from eva. If station, set the icon to the station icon, otherwise set it to null
        let ingressIcon = null;
        if (selectedEva.ingressLocationUuid !== "lander") {
          const ingressStation = evaStations.find(
            (s) => s.uuid === selectedEva.ingressLocationUuid
          );
          ingressIcon = ingressStation ? ingressStation.icon : null;
        }
        EVASequenceItemForTimeline.icon = ingressIcon;
      } else {
        const station = evaStations.find((s) => s?.uuid === sequenceItem.uuid);
        if (!station) continue; //skip if station doesn't exist (happens when station hasn't been selected yet when editing sequence)

        EVASequenceItemForTimeline.name = station.name;
        EVASequenceItemForTimeline.stationElevation = station.elevation ? station.elevation : null;

        //get traverse rate for this sequence item in meters per second (eva rate falling back to mission rate)
        const traverseRate = isNumber(selectedEva.traverseRate)
          ? selectedEva.traverseRate
          : partialMission.traverseRate;
        EVASequenceItemForTimeline.traverseRateMSec = traverseRate * (1000 / 3600); //convert to m/sec

        // get calculatedFieldValues for this station
        const stationCalculatedFields = stationCalculatedFieldsInSelectedEva.find(
          (calculated) => calculated?.uuid === station.uuid
        );

        //calculate duration from actions assigned to station
        // note: this is the "dwell time" which is crew member time spent at the station that is the longest
        const durationMinutes = isNotNumber(station?.duration)
          ? stationCalculatedFields?.totalDwellTime
          : station.duration;

        EVASequenceItemForTimeline.totalDurationMins = durationMinutes;
        storeRef.current.evaLengthCalculatedMins += durationMinutes; //add to sum for total length calculated

        if (partialMission.landerLocation) {
          //calculate distance to lander
          const landerDistance = getDistanceBetweenTwoCoordinates(
            station.location,
            partialMission.landerLocation,
            partialMission.planetRadius
          );

          if (landerDistance > storeRef.current.maxDistFromLanderMeters)
            storeRef.current.maxDistFromLanderMeters = landerDistance;
          EVASequenceItemForTimeline.stationDistFromLanderMeters = landerDistance;

          //calculate walkback path if this station has a walkback
          if (station.walkbackPath) {
            const walkback: Path_PaperJS = {
              subdividedPath: null,
              subdividedDistMeters: [],
              subdividedDurationsMins: [],
              subdividedDistFromLanderMeters: [],
              segmentedElevationMeters: station.walkbackPathSegmentElevations,
              segmentedDistancesMeters: station.walkbackPathSegmentDistances,
            };

            //find max/min of elevation
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

            // subdivide each segment by for greater accuracy
            const divisor = stationCalculatedFields.walkbackDistanceMeters * 0.01; //meters
            const newWalkbackPath: AEGISPoint[] = addPointsAtMeters(
              station.walkbackPath,
              divisor,
              partialMission.planetRadius
            );
            walkback.subdividedPath = newWalkbackPath;

            //loop through new subdivided walkback path
            for (let i = 0; i < newWalkbackPath.length; i++) {
              //calculate distance from lander. Track max distance
              const landerDistance = getDistanceBetweenTwoCoordinates(
                newWalkbackPath[i],
                partialMission.landerLocation,
                partialMission.planetRadius
              );

              if (landerDistance > storeRef.current.maxDistFromLanderMeters)
                storeRef.current.maxDistFromLanderMeters = landerDistance;
              walkback.subdividedDistFromLanderMeters.push(landerDistance);

              //calculate duration. distance is in m, rate is in km/h, duration is in minutes
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

            //set walkback data
            EVASequenceItemForTimeline.stationWalkback = walkback;

            EVASequenceItemForTimeline.icon = station.icon;
          }
        }
      }
    } else if (sequenceItem.type === "traverse") {
      const traverse = evaTraverses.find((t) => t?.uuid === sequenceItem?.uuid);

      if (!traverse || traverse?.path?.length < 2) continue; //skip traverses with less than 2 points
      EVASequenceItemForTimeline.name = traverse.name;
      EVASequenceItemForTimeline.traverse = {
        subdividedPath: null,
        subdividedDistMeters: [],
        subdividedDistFromLanderMeters: [],
        segmentedDistancesMeters: traverse.pathSegmentDistances,
        segmentedElevationMeters: traverse.pathSegmentElevations,
        segmentedAbsoluteSlopeDegrees: traverse.pathSegmentAbsoluteSlopes ?? null,
      };

      //set the traverse rate for the sequence item in meters per second
      //(traverse field value, falling back to eva rate, falling back to mission rate)
      const traverseRate =
        traverse.traverseRate || selectedEva.traverseRate || partialMission.traverseRate;
      EVASequenceItemForTimeline.traverseRateMSec = traverseRate * (1000 / 3600);

      //find max/min of elevation
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
      // get calculatedFieldValues for this traverse
      const calculatedFields = traverseCalculatedFieldsInSelectedEva.find(
        (calculated) => calculated?.uuid === traverse.uuid
      );

      //subdivide each traverse segment for greater accuracy
      const divisor = calculatedFields.distanceMeters * 0.01; //meters
      const newTraverse: AEGISPoint[] = addPointsAtMeters(
        traverse.path,
        divisor,
        partialMission.planetRadius
      );
      EVASequenceItemForTimeline.traverse.subdividedPath = newTraverse;

      const durationIsManual = !isNotNumber(traverse.duration);

      //loop through new subdivided traverse
      let calculatedDuration = 0;
      for (let i = 0; i < newTraverse.length; i++) {
        if (partialMission.landerLocation) {
          //calculate distance from lander. Track max distance
          const landerDistance = getDistanceBetweenTwoCoordinates(
            newTraverse[i],
            partialMission.landerLocation,
            partialMission.planetRadius
          );
          if (landerDistance > storeRef.current.maxDistFromLanderMeters)
            storeRef.current.maxDistFromLanderMeters = landerDistance;
          EVASequenceItemForTimeline.traverse.subdividedDistFromLanderMeters.push(landerDistance);
        }

        //calculate duration. distance is in m, rate is in km/h, duration is in minutes
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
        // assign total duration for the traverse and add it to the eva total duration
        EVASequenceItemForTimeline.totalDurationMins = traverse.duration;
        storeRef.current.evaLengthCalculatedMins += traverse.duration;
      } else {
        // add traverse action durations onto the total duration for the traverse        // note: this is the "dwell time" which is crew member time spent at the traverse actions that is the longest
        const actionDurationMins = calculatedFields?.totalDwellTime;
        const calcTraversePlusActionDuration = Math.ceil(calculatedDuration) + actionDurationMins;

        // assign total duration for the traverse and add it to the eva total duration
        EVASequenceItemForTimeline.totalDurationMins = calcTraversePlusActionDuration;
        storeRef.current.evaLengthCalculatedMins += calcTraversePlusActionDuration;
      }
    }
    storeRef.current.sequenceItems.push(EVASequenceItemForTimeline);
  }

  //loop through any crew positions (for rex) to check max graph ranges
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
