/**
 * Position-agnostic accessors for an EVA's sequence.
 *
 * The sequence holds the entire EVA itinerary and both starts and ends with a
 * station: `station, traverse, station, …, traverse, station`. Index `0` is the
 * egress location and the last index is the ingress location.
 *
 * When an EVA egresses or ingresses at the lander, the station is an
 * auto-managed copy pinned to the lander (`station.isLanderXgress`).
 *
 * Callers must never index the sequence directly — go through these helpers so
 * the shape stays changeable in one place.
 *
 * Each helper takes the sequence array itself, so callers pass `eva?.sequence`
 * or a pending sequence they have not written to the doc yet.
 */

/** The uuid of the station at the egress position, if any. */
export function getEgressStationUuid(
  sequence: readonly EvaSequenceItem[] | undefined
): string | undefined {
  const item = sequence?.[0];
  return item?.type === "station" ? item.uuid : undefined;
}

/** The uuid of the station at the ingress position, if any. */
export function getIngressStationUuid(
  sequence: readonly EvaSequenceItem[] | undefined
): string | undefined {
  const item = sequence?.[(sequence?.length ?? 0) - 1];
  return item?.type === "station" ? item.uuid : undefined;
}

/** Sequence index of the ingress station, or `-1` when there is none. */
export function getIngressIndex(sequence: readonly EvaSequenceItem[] | undefined): number {
  const last = (sequence?.length ?? 0) - 1;
  return sequence?.[last]?.type === "station" ? last : -1;
}

/** Every station uuid in the sequence, in sequence order. */
export function getSequenceStationUuids(
  sequence: readonly EvaSequenceItem[] | undefined
): string[] {
  return (sequence ?? []).filter((item) => item.type === "station").map((item) => item.uuid);
}

/** Every traverse uuid in the sequence, in sequence order. */
export function getSequenceTraverseUuids(
  sequence: readonly EvaSequenceItem[] | undefined
): string[] {
  return (sequence ?? []).filter((item) => item.type === "traverse").map((item) => item.uuid);
}

/**
 * The traverse leaving the egress location, or the one arriving at the ingress
 * location. An EVA with a single traverse returns it for both.
 */
export function getXgressTraverseUuid(
  sequence: readonly EvaSequenceItem[] | undefined,
  xgressType: "egress" | "ingress"
): string | undefined {
  const item = sequence?.[xgressType === "egress" ? 1 : (sequence?.length ?? 0) - 2];
  return item?.type === "traverse" ? item.uuid : undefined;
}

/**
 * Resolve the location uuids on either side of a traverse within an EVA
 * sequence. Either value may be a lander-copy station uuid.
 *
 * Both are `undefined` when the traverse is not part of the sequence.
 */
export function getTraverseNeighborUuids(
  sequence: readonly EvaSequenceItem[] | undefined,
  traverseUuid: string
): { beforeUuid: string | undefined; afterUuid: string | undefined } {
  const index = (sequence ?? []).findIndex(
    (item) => item.type === "traverse" && item.uuid === traverseUuid
  );
  if (index === -1) return { beforeUuid: undefined, afterUuid: undefined };

  return { beforeUuid: sequence[index - 1]?.uuid, afterUuid: sequence[index + 1]?.uuid };
}

/**
 * True when `index` holds a station pinned to the egress or ingress position,
 * and which therefore cannot be reordered or removed from the sequence.
 */
export function isXgressIndex(
  sequence: readonly EvaSequenceItem[] | undefined,
  index: number
): boolean {
  if (sequence?.[index]?.type !== "station") return false;
  return index === 0 || index === sequence.length - 1;
}

/**
 * True when the station at `index` can be swapped with the station before it
 * (`"up"`) or after it (`"down"`).
 *
 * The sequence is `station, traverse, station, …, traverse, station`, so the
 * egress (`0`) and ingress (`length - 1`) positions are pinned and the
 * re-orderable stations span `2 … length - 3`.
 */
export function canMoveStation(
  sequence: readonly EvaSequenceItem[] | undefined,
  index: number,
  direction: "up" | "down"
): boolean {
  if (sequence?.[index]?.type !== "station" || isXgressIndex(sequence, index)) return false;
  return direction === "up" ? index > 2 : index < sequence.length - 3;
}
