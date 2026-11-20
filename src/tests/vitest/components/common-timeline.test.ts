import { processEvaDataFromStore } from "components/interface/timeline/common-timeline";
import { getCalcFieldsForTraverse } from "store/processing/calculatedFields";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankStation } from "store/storeUtils/station";
import { generateBlankTraverse } from "store/storeUtils/traverse";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

test("keeps the timeline finite after a millimeter-scale traverse", () => {
  const landerLocation = { lat: -84.2, lng: 33 };
  const stationLocation = { lat: -84.2, lng: 33.0000005 };
  const planetRadius = 1737400;
  const traverseRate = 2;
  const traverse = generateBlankTraverse({
    path: [landerLocation, stationLocation],
    pathSegmentDistances: [
      getDistanceBetweenTwoCoordinates(landerLocation, stationLocation, planetRadius),
    ],
  });
  const station = generateBlankStation({ location: stationLocation, duration: 20 });
  const eva = generateBlankEVA({
    sequence: [
      { type: "traverse", uuid: traverse.uuid },
      { type: "station", uuid: station.uuid },
    ],
  });
  const storeRef = { current: null as EvaCalculated_PaperJS };
  const terrainProfiles = {};

  processEvaDataFromStore({
    terrainProfiles,
    storeRef,
    partialMission: {
      landerLocation,
      planetRadius,
      traverseRate,
      walkbackRate: 2,
      demResolution: 1,
      landerElevationMeters: null,
      defaultEvaDuration: 30,
    },
    selectedEva: eva,
    evaStations: [station],
    evaTraverses: [traverse],
    stationCalculatedFieldsInSelectedEva: [],
    traverseCalculatedFieldsInSelectedEva: [
      getCalcFieldsForTraverse({
        terrainProfiles,
        traverse,
        missionTraverseRate: traverseRate,
        evaTraverseRate: eva.traverseRate,
        traverseActions: [],
      }),
    ],
    selectedRex: null,
  });

  const [traverseItem, stationItem] = storeRef.current.sequenceItems;
  const subdividedDistances = traverseItem.traverse.subdividedDistMeters;
  expect(subdividedDistances.length).toBeGreaterThan(1);
  expect(subdividedDistances.every(Number.isFinite)).toBe(true);
  expect(traverseItem.totalDurationMins).toBe(1);
  expect(stationItem.secondsStart).toBe(60);
  expect(storeRef.current.evaLengthCalculatedMins).toBe(21);
});
