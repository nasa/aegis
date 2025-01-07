import isNumber from "lodash/isNumber";
import { MutableRefObject } from "react";
import { addPointsAtMeters, getDistanceBetweenTwoCoordinates } from "utils/geoMath";

/**
 * Populate storeRefs with all our store information so paper.js can read it.
 * Perform additional calculations required for drawing, such as subdividing any paths
 */
export const processEvaDataFromStore = ({
  storeRef,
  mission,
  selectedEva,
  evaStations,
  evaTraverses,
  missionTraverseRate,
  missionWalkbackRate,
  stationCalculatedFieldsInSelectedEva,
  selectedRex,
}: {
  storeRef: MutableRefObject<EvaCalculated_PaperJS>;
  mission: Mission;
  selectedEva: Eva;
  evaStations: Station[];
  evaTraverses: Traverse[];
  missionTraverseRate: number;
  missionWalkbackRate: number;
  stationCalculatedFieldsInSelectedEva: StationCalculatedFields[];
  selectedRex: Rex;
}): void => {
  storeRef.current = {
    sequenceItems: [],
    selectedEvaSequenceItemUuid: null,
    maxDistFromLanderMeters: 0,
    evaLengthMins: selectedEva?.maxDuration
      ? +selectedEva?.maxDuration
      : +mission?.defaultEvaDuration,
    evaLengthCalculatedMins: 0,
    maxElevationMeters: null,
    minElevationMeters: null,
    landerElevationMeters: null,
    elevationResolutionMeters: null,
    egressDurationMins: null,
    ingressDurationMins: null,
  };

  if (!selectedEva?.sequence || !mission) return;
  storeRef.current.elevationResolutionMeters = mission.demResolution;
  storeRef.current.landerElevationMeters = mission.landerElevationMeters;

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
        EVASequenceItemForTimeline.stationElevation = mission.landerElevationMeters;
        EVASequenceItemForTimeline.stationDistFromLanderMeters = 0;
        EVASequenceItemForTimeline.stationWalkback = null;
        EVASequenceItemForTimeline.icon = "1f680"; //rocket
      } else if (sequenceItem.uuid === "ingress") {
        EVASequenceItemForTimeline.name = "Ingress";
        EVASequenceItemForTimeline.totalDurationMins = selectedEva.ingressDuration;
        storeRef.current.ingressDurationMins = selectedEva.ingressDuration;
        storeRef.current.evaLengthCalculatedMins += selectedEva.ingressDuration; //add to sum for total length calculated
        EVASequenceItemForTimeline.stationElevation = mission.landerElevationMeters;
        EVASequenceItemForTimeline.stationDistFromLanderMeters = 0;
        EVASequenceItemForTimeline.stationWalkback = null;
        EVASequenceItemForTimeline.icon = "1f680"; //rocket
      } else {
        const station = evaStations.find((s) => s?.uuid === sequenceItem.uuid);
        if (!station) continue; //skip if station doesn't exist (happens when station hasn't been selected yet when editing sequence)

        EVASequenceItemForTimeline.name = station.name;
        EVASequenceItemForTimeline.stationElevation = station.elevation ? station.elevation : null;

        //get traverse rate for this sequence item in meters per second (eva rate falling back to mission rate)
        const traverseRate = isNumber(selectedEva.traverseRate)
          ? selectedEva.traverseRate
          : missionTraverseRate;
        EVASequenceItemForTimeline.traverseRateMSec = traverseRate * (1000 / 3600); //convert to m/sec

        // get calculatedFieldValues for this station
        const calculatedFields = stationCalculatedFieldsInSelectedEva.find(
          (calculated) => calculated?.uuid === station.uuid
        );

        //calculate duration from actions assigned to station
        // note: this is the "dwell time" which is crew member time spent at the station that is the longest
        const durationMinutes = calculatedFields?.totalDwellTime.durationUpper;

        EVASequenceItemForTimeline.totalDurationMins = durationMinutes;
        storeRef.current.evaLengthCalculatedMins += durationMinutes; //add to sum for total length calculated

        if (mission.landerLocation) {
          //calculate distance to lander
          const landerDistance = getDistanceBetweenTwoCoordinates(
            station.location,
            mission.landerLocation,
            mission.planetRadius
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

            // subdivide each segment by 150 meters for greater accuracy

            const newWalkbackPath: AEGISPoint[] = addPointsAtMeters(
              station.walkbackPath,
              150,
              mission.planetRadius
            );
            walkback.subdividedPath = newWalkbackPath;

            //loop through new subdivided walkback path
            for (let i = 0; i < newWalkbackPath.length; i++) {
              //calculate distance from lander. Track max distance
              const landerDistance = getDistanceBetweenTwoCoordinates(
                newWalkbackPath[i],
                mission.landerLocation,
                mission.planetRadius
              );

              if (landerDistance > storeRef.current.maxDistFromLanderMeters)
                storeRef.current.maxDistFromLanderMeters = landerDistance;
              walkback.subdividedDistFromLanderMeters.push(landerDistance);

              //calculate duration. distance is in m, rate is in km/h, duration is in minutes
              if (i !== newWalkbackPath.length - 1) {
                const distanceSegment = getDistanceBetweenTwoCoordinates(
                  newWalkbackPath[i],
                  newWalkbackPath[i + 1],
                  mission.planetRadius
                );
                walkback.subdividedDistMeters.push(distanceSegment);
                const walkbackTraverseRate = isNumber(station.walkbackTraverseRate)
                  ? station.walkbackTraverseRate
                  : missionWalkbackRate;

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
      };

      //set the traverse rate for the sequence item in meters per second
      //(traverse field value, falling back to eva rate, falling back to mission rate)
      const traverseRate = traverse.traverseRate || selectedEva.traverseRate || missionTraverseRate;
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

      //subdivide seach traverse segment by 150 meters for greater accuracy
      const newTraverse: AEGISPoint[] = addPointsAtMeters(traverse.path, 150, mission.planetRadius);
      EVASequenceItemForTimeline.traverse.subdividedPath = newTraverse;

      EVASequenceItemForTimeline.totalDurationMins = 0;
      //loop through new subdivided traverse
      for (let i = 0; i < newTraverse.length; i++) {
        if (mission.landerLocation) {
          //calculate distance from lander. Track max distance
          const landerDistance = getDistanceBetweenTwoCoordinates(
            newTraverse[i],
            mission.landerLocation,
            mission.planetRadius
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
            mission.planetRadius
          );
          EVASequenceItemForTimeline.traverse.subdividedDistMeters.push(distanceSegment);
          const duration = isNaN(traverseRate)
            ? 0
            : (distanceSegment / (+traverseRate * 1000)) * 60;
          EVASequenceItemForTimeline.totalDurationMins += duration;
          storeRef.current.evaLengthCalculatedMins += duration; //add to sum for total length calculated
        }
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
      mission.landerLocation,
      mission.planetRadius
    ).toFixed(2);
    if (newDistance > storeRef.current.maxDistFromLanderMeters)
      storeRef.current.maxDistFromLanderMeters = newDistance;
  }
};
