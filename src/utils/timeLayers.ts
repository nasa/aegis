import { secondsFromhhmmss } from "./formatting";

/**
 * Match given time to closest time in timelayermanifest
 */
export function matchTimeToManifest(
  layerTime: string,
  timeLayerManifest: TimeLayerInfo[]
): TimeLayerInfo {
  const layerDateTime = new Date(layerTime);
  let lowerManifestInd = 0;
  let upperManifestInd = timeLayerManifest.length - 1;
  while (lowerManifestInd < upperManifestInd - 1) {
    const mid = Math.floor((lowerManifestInd + upperManifestInd) / 2);
    const midTime = new Date(timeLayerManifest[mid].datetime);
    if (layerDateTime < midTime) {
      upperManifestInd = mid;
    } else {
      lowerManifestInd = mid;
    }
  }
  const lowerDateDistance = findDateDistance(
    layerDateTime,
    new Date(timeLayerManifest[lowerManifestInd].datetime)
  );
  const upperDateDistance = findDateDistance(
    layerDateTime,
    new Date(timeLayerManifest[upperManifestInd].datetime)
  );

  const timeLayerIndex =
    lowerDateDistance < upperDateDistance ? lowerManifestInd : upperManifestInd;

  const timeLayerInfo: TimeLayerInfo = timeLayerManifest[timeLayerIndex];
  const timeBounds = getManifestTimeBounds(timeLayerManifest, timeLayerIndex);

  return {
    datetime: timeLayerInfo.datetime,
    dirName: timeLayerInfo.dirName,
    lowerBound: timeBounds[0],
    upperBound: timeBounds[1],
  };
}

export function getManifestTimeBounds(
  timeLayerManifest: TimeLayerInfo[],
  manifestIndex: number
): [string, string] {
  const currentLayer = timeLayerManifest[manifestIndex];
  if (manifestIndex === 0) {
    return [
      currentLayer.datetime,
      findMiddleTime(currentLayer.datetime, timeLayerManifest[manifestIndex + 1].datetime),
    ];
  } else if (manifestIndex === timeLayerManifest.length - 1) {
    return [
      findMiddleTime(timeLayerManifest[manifestIndex - 1].datetime, currentLayer.datetime),
      currentLayer.datetime,
    ];
  } else {
    return [
      findMiddleTime(timeLayerManifest[manifestIndex - 1].datetime, currentLayer.datetime),
      findMiddleTime(currentLayer.datetime, timeLayerManifest[manifestIndex + 1].datetime),
    ];
  }
}

export function getManifestJsonTimeBounds(
  timeLayerManifest: TimeLayerJson[],
  manifestIndex: number
): [string, string] {
  const currentLayer = timeLayerManifest[manifestIndex];
  if (manifestIndex === 0) {
    return [
      currentLayer.datetime,
      findMiddleTime(currentLayer.datetime, timeLayerManifest[manifestIndex + 1].datetime),
    ];
  } else if (manifestIndex === timeLayerManifest.length - 1) {
    return [
      findMiddleTime(timeLayerManifest[manifestIndex - 1].datetime, currentLayer.datetime),
      currentLayer.datetime,
    ];
  } else {
    return [
      findMiddleTime(timeLayerManifest[manifestIndex - 1].datetime, currentLayer.datetime),
      findMiddleTime(currentLayer.datetime, timeLayerManifest[manifestIndex + 1].datetime),
    ];
  }
}

export function checkTimeInBounds(time: string, lowerBound: string, upperBound: string): boolean {
  const currentDate = new Date(time);
  return currentDate >= new Date(lowerBound) && currentDate <= new Date(upperBound);
}

export function findMiddleTime(firstTime: string, secondTime: string): string {
  const firstTimeDate = new Date(firstTime);
  const secondTimeDate = new Date(secondTime);
  const middleTime = new Date((firstTimeDate.getTime() + secondTimeDate.getTime()) / 2);
  return middleTime.toISOString();
}

export function findDateDistance(time1: Date, time2: Date): number {
  return Math.abs(time1.getTime() - time2.getTime());
}

export function addTimeToDateTime(dateTime: string, time: string): string {
  const dateTimeNumeric = new Date(dateTime).getTime();
  const timeNumeric = secondsFromhhmmss(time) * 1000;
  return new Date(dateTimeNumeric + timeNumeric).toISOString();
}
