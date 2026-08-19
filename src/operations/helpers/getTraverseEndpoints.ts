import { getTraverseNeighborUuids, isLanderUuid, isLanderXgressStation } from "./evaSequence";
import type { EvaSequenceSource } from "./evaSequence";

/**
 * Resolves the before/after locations and names for a traverse's endpoints
 * within an EVA sequence.
 *
 * Neighbor resolution is delegated to `getTraverseNeighborUuids`, so this
 * function does not need to know where the egress/ingress locations are stored.
 *
 * Lander stations resolve to their own stored location. Moving the lander
 * repositions every `isLanderXgress` station in the same change, so that copy is
 * always current.
 *
 * `landerLocation` is only used for the legacy `"lander"` sentinel uuid, which
 * no code path can put in a sequence any more. Both the parameter and the
 * sentinel branch are dead and are removed once the deprecated
 * `egressLocationUuid` / `ingressLocationUuid` fields go.
 *
 * The optional `stationOverride` lets callers substitute a different location/name
 * for a specific station UUID — used when a station is being edited and
 * the doc has not yet been updated.
 */

export function getTraverseEndpoints(
  traverseUuid: string,
  eva: EvaSequenceSource | undefined,
  stations: { [uuid: string]: Station } | undefined,
  landerLocation: AEGISPoint,
  stationOverride?: { uuid: string; location: AEGISPoint; name: string }
): TraverseEndpointsResult {
  const getLocationAndName = (
    uuid: string | undefined
  ): { location: AEGISPoint | undefined; name: string } => {
    if (uuid === undefined) return { location: undefined, name: "" };
    if (isLanderUuid(uuid)) return { location: landerLocation, name: "Lander" };
    if (stationOverride && uuid === stationOverride.uuid) {
      return { location: stationOverride.location, name: stationOverride.name };
    }
    const station = stations?.[uuid];
    if (isLanderXgressStation(station)) {
      return { location: station.location, name: station.name || "Lander" };
    }
    return { location: station?.location, name: station?.name ?? "" };
  };

  const { beforeUuid, afterUuid } = getTraverseNeighborUuids(eva, traverseUuid);
  const before = getLocationAndName(beforeUuid);
  const after = getLocationAndName(afterUuid);

  return {
    locationBefore: before.location,
    locationAfter: after.location,
    nameBefore: before.name,
    nameAfter: after.name,
  };
}
