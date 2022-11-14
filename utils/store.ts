/*
 * Upsert any record into any array of objects that contain a uuid field.
 */
// The parameter types here are too restrictive and are only here because of the linting rule enforcing that this can't be a general function accepting any type of object with uuids in it.
export function upsertByUuid(array: POI[], element: POI): POI[] {
  // (1)
  const i = array.findIndex((_element) => _element.uuid === element.uuid);
  if (i > -1) array[i] = element;
  // (2)
  else array.push(element);
  return array;
}
