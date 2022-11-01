export function upsertByUuid(array, element) {
  // (1)
  const i = array.findIndex((_element) => _element.uuid === element.uuid);
  if (i > -1) array[i] = element;
  // (2)
  else array.push(element);
}
