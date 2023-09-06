import { v4 as uuidv4 } from "uuid";
import { roundDateToSecond } from "utils/formatting";

/**
 * Creates a new emptyLayer object with no mission and no sublayers
 * @returns A new Layer object with required properties
 */
export function createNewLayer(missionId?: number): Layer {
  return {
    uuid: null,
    missionId: missionId || null,
    name: "",
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
}

/**
 * Creates a new empty sublayer
 * @returns A new Sublayer object with required properties
 */
export function createNewSublayer(layerUuid?: string, missionId?: number): Sublayer {
  const sublayer: Sublayer = {
    uuid: uuidv4(),
    missionId: missionId || null,
    layerUuid: layerUuid || null,
    name: "",
    description: "",
    legend: null,
    url: "/{z}/{x}/{y}.png",
    type: "tile",
    filePath: "",
    boundingBox: null,
    tileFormat: "TMS",
    minNativeZoom: 0,
    maxNativeZoom: 0,
    maxZoom: 30,
    color: "",
    opacity: 0,
    fillColor: "",
    fillOpacity: 0,
    weight: 0,
    createdAt: roundDateToSecond(new Date()).toISOString(),
    updatedAt: roundDateToSecond(new Date()).toISOString(),
  };
  return sublayer;
}
