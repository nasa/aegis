/**
 * Resolves the before/after locations and names for a traverse's endpoints
 * by scanning an EVA sequence.
 *
 * For a given traverseUuid:
 *   - "before" comes from the egress location (if first) or the preceding station.
 *   - "after"  comes from the ingress location (if last)  or the following station.
 *
 * The optional `stationOverride` lets callers substitute a different location/name
 * for a specific station UUID — used when a station is being edited and
 * the doc has not yet been updated.
 */

export function getTraverseEndpoints(
  traverseUuid: string,
  evaSequence: EvaSequenceItem[],
  egressLocationUuid: string,
  ingressLocationUuid: string,
  stations: { [uuid: string]: Station } | undefined,
  landerLocation: AEGISPoint,
  stationOverride?: { uuid: string; location: AEGISPoint; name: string }
): TraverseEndpointsResult {
  let locationBefore: AEGISPoint | undefined;
  let locationAfter: AEGISPoint | undefined;
  let nameBefore = "";
  let nameAfter = "";

  const resolveStation = (uuid: string): { location: AEGISPoint | undefined; name: string } => {
    if (stationOverride && uuid === stationOverride.uuid) {
      return { location: stationOverride.location, name: stationOverride.name };
    }
    const s = stations?.[uuid];
    return { location: s?.location, name: s?.name ?? "" };
  };

  for (let index = 0; index < evaSequence.length; index++) {
    const item = evaSequence[index];
    if (item.type !== "traverse" || item.uuid !== traverseUuid) continue;

    // Resolve "before"
    if (index === 0) {
      if (egressLocationUuid === "lander") {
        locationBefore = landerLocation;
        nameBefore = "Lander";
      } else {
        const resolved = resolveStation(egressLocationUuid);
        locationBefore = resolved.location;
        nameBefore = resolved.name;
      }
    } else {
      const resolved = resolveStation(evaSequence[index - 1].uuid);
      locationBefore = resolved.location;
      nameBefore = resolved.name;
    }

    // Resolve "after"
    if (index === evaSequence.length - 1) {
      if (ingressLocationUuid === "lander") {
        locationAfter = landerLocation;
        nameAfter = "Lander";
      } else {
        const resolved = resolveStation(ingressLocationUuid);
        locationAfter = resolved.location;
        nameAfter = resolved.name;
      }
    } else {
      const resolved = resolveStation(evaSequence[index + 1].uuid);
      locationAfter = resolved.location;
      nameAfter = resolved.name;
    }

    break; // found the traverse — no need to continue
  }

  return { locationBefore, locationAfter, nameBefore, nameAfter };
}
