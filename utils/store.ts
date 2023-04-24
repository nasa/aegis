/**
 * Upsert (update or insert) an element into any array of objects that contain a uuid field.
 * @param array The array the object is upserted into
 * @param element The element/object to upsert
 * @returns The modified array with the upserted element.
 */

import _ from "lodash";

interface MustContain {
  uuid: string;
  createdAt?: string;
}
export function upsertToArrayByUuid<T extends MustContain>(array: T[], element: T): T[] {
  // (1)
  const i = array?.findIndex((_element) => _element.uuid === element.uuid);
  if (i > -1) array[i] = element;
  // (2)
  else array.push(element);

  // sort by createdAt, then by uuid -- item arrays in every store will be sorted this way for easy array comparison
  array.sort((a, b) => {
    if (new Date(a.createdAt) < new Date(b.createdAt)) return -1;
    if (new Date(a.createdAt) > new Date(b.createdAt)) return 1;
    if (a.uuid < b.uuid) return -1;
    if (a.uuid > b.uuid) return 1;
    return 0;
  });
  return array;
}

// set map layerControls object to all layers invisible
export function setAllLayerControlsInvisible(layerControls: LayerControls): LayerControls {
  const newLayerControls = _.cloneDeep(layerControls);

  Object.keys(newLayerControls).forEach((key) => {
    newLayerControls[key].enabled = false;
  });
  return newLayerControls;
}
