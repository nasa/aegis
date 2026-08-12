/**
 * Position-agnostic accessors for an EVA's sequence.
 *
 * The sequence currently holds only the middle of an EVA: it starts and ends
 * with a traverse, and the egress/ingress locations live outside it on
 * `eva.egressLocationUuid` / `eva.ingressLocationUuid`. These helpers hide that
 * shape so callers never index the sequence directly.
 *
 * When egress/ingress become real `Station` entries at index `0` and
 * `length - 1`, only this file changes.
 */

/** Sentinel uuid meaning "the mission's lander" rather than a station. */
export const LANDER_UUID = "lander";

/**
 * Minimum shape these helpers need. `Eva` satisfies it structurally, and
 * callers holding a pending or overridden sequence can build one inline.
 */
export type EvaSequenceSource = {
  sequence: readonly EvaSequenceItem[];
  egressLocationUuid?: string;
  ingressLocationUuid?: string;
};

/** True when a location uuid refers to the lander instead of a station. */
export function isLanderUuid(uuid: string | undefined): boolean {
  return uuid === LANDER_UUID;
}

/** Station uuid or `"lander"` occupying the egress slot. */
export function getEgressLocationUuid(eva: EvaSequenceSource | undefined): string | undefined {
  return eva?.egressLocationUuid;
}

/** Station uuid or `"lander"` occupying the ingress slot. */
export function getIngressLocationUuid(eva: EvaSequenceSource | undefined): string | undefined {
  return eva?.ingressLocationUuid;
}

/** The egress slot as a sequence item, or `null` when it is the lander. */
export function getEgressSequenceItem(eva: EvaSequenceSource | undefined): EvaSequenceItem | null {
  const uuid = getEgressLocationUuid(eva);
  if (!uuid || isLanderUuid(uuid)) return null;
  return { type: "station", uuid };
}

/** The ingress slot as a sequence item, or `null` when it is the lander. */
export function getIngressSequenceItem(eva: EvaSequenceSource | undefined): EvaSequenceItem | null {
  const uuid = getIngressLocationUuid(eva);
  if (!uuid || isLanderUuid(uuid)) return null;
  return { type: "station", uuid };
}

/** Every station item in the sequence, in sequence order. */
export function getSequenceStationItems(eva: EvaSequenceSource | undefined): EvaSequenceItem[] {
  return (eva?.sequence ?? []).filter((item) => item.type === "station");
}

/** Every traverse item in the sequence, in sequence order. */
export function getSequenceTraverseItems(eva: EvaSequenceSource | undefined): EvaSequenceItem[] {
  return (eva?.sequence ?? []).filter((item) => item.type === "traverse");
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
 * Under the current shape — `[traverse, station, …, station, traverse]` —
 * every station in the sequence is reorderable, so the range spans
 * `1 … length - 2`.
 */
export function getMovableStationIndexRange(eva: EvaSequenceSource | undefined): {
  first: number;
  last: number;
} {
  const length = eva?.sequence?.length ?? 0;
  return { first: 1, last: length - 2 };
}

/** True when `index` holds the first reorderable station. */
export function isFirstMovableStationIndex(
  eva: EvaSequenceSource | undefined,
  index: number
): boolean {
  return index === getMovableStationIndexRange(eva).first;
}

/** True when `index` holds the last reorderable station. */
export function isLastMovableStationIndex(
  eva: EvaSequenceSource | undefined,
  index: number
): boolean {
  return index === getMovableStationIndexRange(eva).last;
}

/**
 * True when `index` holds a station that is pinned to the egress or ingress
 * slot and therefore cannot be reordered or removed.
 *
 * Always false under the current shape, where the xgress locations live
 * outside the sequence.
 */
export function isXgressIndex(eva: EvaSequenceSource | undefined, index: number): boolean {
  const item = eva?.sequence?.[index];
  if (item?.type !== "station") return false;
  const { first, last } = getMovableStationIndexRange(eva);
  return index < first || index > last;
}

/** True when the station at `index` can be swapped with the station before it. */
export function canMoveStationUp(eva: EvaSequenceSource | undefined, index: number): boolean {
  return index > getMovableStationIndexRange(eva).first;
}

/** True when the station at `index` can be swapped with the station after it. */
export function canMoveStationDown(eva: EvaSequenceSource | undefined, index: number): boolean {
  return index < getMovableStationIndexRange(eva).last;
}

/**
 * Resolve the location uuids on either side of a traverse within an EVA
 * sequence. Either value may be `"lander"`.
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
    beforeUuid: index === 0 ? getEgressLocationUuid(eva) : sequence[index - 1].uuid,
    afterUuid:
      index === sequence.length - 1 ? getIngressLocationUuid(eva) : sequence[index + 1].uuid,
  };
}
