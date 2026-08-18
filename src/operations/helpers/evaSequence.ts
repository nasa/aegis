/**
 * Position-agnostic accessors for an EVA's sequence.
 *
 * The sequence holds the entire EVA itinerary and both starts and ends with a
 * station: `station, traverse, station, …, traverse, station`. Index `0` is the
 * egress location and the last index is the ingress location.
 *
 * When an EVA egresses or ingresses at the lander, the station  is
 * an auto-managed copy pinned to the lander (`station.isLanderXgress`). The
 * legacy `eva.egressLocationUuid` / `ingressLocationUuid` fields are still
 * written as a derived mirror for readers that have not been migrated yet, but
 * nothing in this file reads them.
 *
 * Callers must never index the sequence directly — go through these helpers so
 * the shape stays changeable in one place.
 */

/** Sentinel uuid meaning "the mission's lander" rather than a station. */
export const LANDER_UUID = "lander";

/**
 * Minimum shape these helpers need. `Eva` satisfies it structurally, and
 * callers holding a pending sequence can build one inline.
 */
export type EvaSequenceSource = {
  sequence: readonly EvaSequenceItem[];
};

/** Station lookup used to resolve whether an xgress station is a lander copy. */
export type StationLookup = { [uuid: string]: Station } | undefined;

/** True when a location uuid refers to the lander instead of a station. */
export function isLanderUuid(uuid: string | undefined): boolean {
  return uuid === LANDER_UUID;
}

/** True when this station is an xgress station at lander. */
export function isLanderXgressStation(station: Station | undefined): boolean {
  return station?.isLanderXgress === true;
}

/** The egress sequence item, or `null` when the sequence is empty. */
export function getEgressSequenceItem(eva: EvaSequenceSource | undefined): EvaSequenceItem | null {
  const item = eva?.sequence?.[0];
  return item?.type === "station" ? item : null;
}

/** The ingress sequence item, or `null` when the sequence is empty. */
export function getIngressSequenceItem(eva: EvaSequenceSource | undefined): EvaSequenceItem | null {
  const sequence = eva?.sequence ?? [];
  const item = sequence[sequence.length - 1];
  return item?.type === "station" ? item : null;
}

/** Sequence index of the ingress station, or `-1` when there is none. */
export function getIngressIndex(eva: EvaSequenceSource | undefined): number {
  const sequence = eva?.sequence ?? [];
  const last = sequence.length - 1;
  return last >= 0 && sequence[last]?.type === "station" ? last : -1;
}

/** The uuid of the egress station, if any. */
export function getEgressStationUuid(eva: EvaSequenceSource | undefined): string | undefined {
  return getEgressSequenceItem(eva)?.uuid;
}

/** The uuid of the ingress station, if any. */
export function getIngressStationUuid(eva: EvaSequenceSource | undefined): string | undefined {
  return getIngressSequenceItem(eva)?.uuid;
}

/**
 * Station uuid occupying the egress position, or `"lander"` when that station is a
 * lander copy. This is the value the legacy `eva.egressLocationUuid` mirrors.
 */
export function getEgressLocationUuid(
  eva: EvaSequenceSource | undefined,
  stations: StationLookup
): string | undefined {
  const uuid = getEgressStationUuid(eva);
  if (!uuid) return undefined;
  return isLanderXgressStation(stations?.[uuid]) ? LANDER_UUID : uuid;
}

/**
 * Station uuid occupying the ingress position, or `"lander"` when that station is a
 * lander copy. This is the value the legacy `eva.ingressLocationUuid` mirrors.
 */
export function getIngressLocationUuid(
  eva: EvaSequenceSource | undefined,
  stations: StationLookup
): string | undefined {
  const uuid = getIngressStationUuid(eva);
  if (!uuid) return undefined;
  return isLanderXgressStation(stations?.[uuid]) ? LANDER_UUID : uuid;
}

/** Every station item in the sequence, in sequence order. */
export function getSequenceStationItems(eva: EvaSequenceSource | undefined): EvaSequenceItem[] {
  return (eva?.sequence ?? []).filter((item) => item.type === "station");
}

/** Every traverse item in the sequence, in sequence order. */
export function getSequenceTraverseItems(eva: EvaSequenceSource | undefined): EvaSequenceItem[] {
  return (eva?.sequence ?? []).filter((item) => item.type === "traverse");
}

/**
 * Station items the user placed themselves — everything between the egress and
 * ingress.
 */
export function getMiddleStationItems(eva: EvaSequenceSource | undefined): EvaSequenceItem[] {
  const { first, last } = getMovableStationIndexRange(eva);
  const sequence = eva?.sequence ?? [];
  const items: EvaSequenceItem[] = [];
  for (let i = first; i <= last; i++) {
    const item = sequence[i];
    if (item?.type === "station") items.push(item);
  }
  return items;
}

/** The traverse leaving the egress location, or `null` when there is none. */
export function getFirstTraverseItem(eva: EvaSequenceSource | undefined): EvaSequenceItem | null {
  return getSequenceTraverseItems(eva)[0] ?? null;
}

/** The traverse arriving at the ingress location, or `null` when there is none. */
export function getLastTraverseItem(eva: EvaSequenceSource | undefined): EvaSequenceItem | null {
  const traverses = getSequenceTraverseItems(eva);
  return traverses[traverses.length - 1] ?? null;
}

/**
 * Inclusive index range of the stations the user may reorder.
 *
 * The sequence is `station, traverse, station, …, traverse, station`, so the
 * egress (`0`) and ingress (`length - 1`) positions are pinned and the reorderable
 * stations span `2 … length - 3`.
 *
 * When an EVA has no middle stations the range is empty (`first > last`).
 */
export function getMovableStationIndexRange(eva: EvaSequenceSource | undefined): {
  first: number;
  last: number;
} {
  const length = eva?.sequence?.length ?? 0;
  return { first: 2, last: length - 3 };
}

/**
 * True when `index` holds a station pinned to the egress or ingress position, and
 * which therefore cannot be reordered or removed from the sequence.
 */
export function isXgressIndex(eva: EvaSequenceSource | undefined, index: number): boolean {
  const item = eva?.sequence?.[index];
  if (item?.type !== "station") return false;
  const { first, last } = getMovableStationIndexRange(eva);
  return index < first || index > last;
}

/** True when the station at `index` can be swapped with the station before it. */
export function canMoveStationUp(eva: EvaSequenceSource | undefined, index: number): boolean {
  return !isXgressIndex(eva, index) && index > getMovableStationIndexRange(eva).first;
}

/** True when the station at `index` can be swapped with the station after it. */
export function canMoveStationDown(eva: EvaSequenceSource | undefined, index: number): boolean {
  return !isXgressIndex(eva, index) && index < getMovableStationIndexRange(eva).last;
}

/**
 * Resolve the location uuids on either side of a traverse within an EVA
 * sequence. Either value may be a lander-copy station uuid.
 *
 * Both are `undefined` when the traverse is not part of the sequence.
 */
export function getTraverseNeighborUuids(
  eva: EvaSequenceSource | undefined,
  traverseUuid: string
): { beforeUuid: string | undefined; afterUuid: string | undefined } {
  const sequence = eva?.sequence ?? [];
  const index = sequence.findIndex(
    (item) => item.type === "traverse" && item.uuid === traverseUuid
  );
  if (index === -1) return { beforeUuid: undefined, afterUuid: undefined };

  return {
    beforeUuid: sequence[index - 1]?.uuid,
    afterUuid: sequence[index + 1]?.uuid,
  };
}
