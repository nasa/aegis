import _ from "lodash";
import { getSlope } from "./geoMath";

/**
 * Get the hover data from an array of graph data items given a mouse hover x point
 * Extrapolate values if the hover x point falls between two array points
 * Also calculate slope for optional usage
 * @param graphArray
 * @param hoverPoint
 * @returns the y pixel, the extrapolated value, and optional slope from the surrounding points before/after.
 */
export function getHoverValue(
  graphArray: GraphDataItem[],
  hoverPointX: number
): { y: number; val: number; slope: number } {
  let pointBefore: GraphDataItem = null;
  let pointAfter: GraphDataItem = null;
  for (const graphDataItem of graphArray) {
    if (hoverPointX > graphDataItem.xPixel) {
      pointBefore = graphDataItem;
    } else if (hoverPointX < graphDataItem.xPixel) {
      pointAfter = graphDataItem;
      break;
    }
  }
  if (!pointAfter) {
    //we're past the end of the graph data. Use last point as pointAfter
    pointAfter = _.last(graphArray);
  }

  //extrapolate percentage between the nearest points for estimated value
  let newVal: number;
  let newYPixel: number;
  if (pointBefore.val === pointAfter.val) {
    //we're at a station. Don't extrapolate values or y pixel
    newVal = pointBefore.val;
    newYPixel = pointBefore.yPixel;
  } else {
    const percent = (hoverPointX - pointBefore.xPixel) / (pointAfter.xPixel - pointBefore.xPixel);
    newVal = pointBefore.val + (pointAfter.val - pointBefore.val) * percent;
    newYPixel = pointBefore.yPixel + (pointAfter.yPixel - pointBefore.yPixel) * percent;
  }

  const slope = getSlope(pointBefore.xPixel, pointBefore.val, pointAfter.xPixel, pointAfter.val);

  return {
    y: newYPixel,
    val: newVal,
    slope,
  };
}
