/**
 * refUuid → uuid resolution for the Maestro v2 MDAU pipeline.
 *
 * Maestro sends every entity keyed by its stable `refUuid`. AEGIS stores
 * entities keyed by their per-instance `uuid`. Because a single `sendMDAU`
 * payload can reference many stations, traverses, evas, actions, and rexes,
 * we build the reverse maps ONCE per payload in a single pass over the doc
 * and reuse them for every lookup.
 */

/** A single refUuid → uuid lookup */
type RefUuidMap = Map<string, string>;

/**
 * Resolution maps for a mission, grouped by rex scope.
 */
export interface MdauRefUuidMaps {
  asPlannedStations: RefUuidMap;
  asPlannedTraverses: RefUuidMap;
  asPlannedActions: RefUuidMap;
  /** rexUuid → (station refUuid → station uuid) */
  rexStations: Map<string, RefUuidMap>;
  /** rexUuid → (traverse refUuid → traverse uuid) */
  rexTraverses: Map<string, RefUuidMap>;
  /** rexUuid → (action refUuid → action uuid) */
  rexActions: Map<string, RefUuidMap>;
  /**
   * Any entity uuid (station / traverse / action / rex / eva) → the set of EVA
   * uuids that have it. An station may sit in more than one as-planned EVA's
   * sequence (and be the ingress/egress location of others), so its actions
   * are likewise in every one of those EVAs. Traverses are never shared.
   * Entities not belonging to an EVA are absent.
   */
  evaUuidsByUuid: Map<string, Set<string>>;
}

/**
 * Build all refUuid → uuid resolution maps for a mission in a single pass.
 */
export const buildMdauRefUuidMaps = (mission: Mission): MdauRefUuidMaps => {
  const maps: MdauRefUuidMaps = {
    asPlannedStations: new Map(),
    asPlannedTraverses: new Map(),
    asPlannedActions: new Map(),
    rexStations: new Map(),
    rexTraverses: new Map(),
    rexActions: new Map(),
    evaUuidsByUuid: new Map(),
  };

  const addToEvaUuid = (uuid: string, evaUuid: string): void => {
    const evaUuids = maps.evaUuidsByUuid.get(uuid);
    if (evaUuids) evaUuids.add(evaUuid);
    else maps.evaUuidsByUuid.set(uuid, new Set([evaUuid]));
  };

  // Map every EVA uuid → the rexUuid (if any).
  // As-planned EVAs not present
  const rexUuidByEvaUuid = new Map<string, string>();
  for (const rex of Object.values(mission.rexes ?? {})) {
    rexUuidByEvaUuid.set(rex.evaUuid, rex.uuid);
    // Rex → its EVA (used for subscription gating).
    addToEvaUuid(rex.uuid, rex.evaUuid);
  }

  // Map every station/traverse uuid → the rexUuid whose EVA sequence contains
  // it (if any).
  // In the same loop, index every entity uuid → its rex uuids.
  const rexUuidBySequenceUuid = new Map<string, string>();
  for (const eva of Object.values(mission.evas ?? {})) {
    // Eva → itself.
    addToEvaUuid(eva.uuid, eva.uuid);

    const rexUuid = rexUuidByEvaUuid.get(eva.uuid);
    for (const seqItem of eva.sequence ?? []) {
      addToEvaUuid(seqItem.uuid, eva.uuid);
      if (rexUuid) rexUuidBySequenceUuid.set(seqItem.uuid, rexUuid);
    }
  }

  const getRexMap = (bucket: Map<string, RefUuidMap>, rexUuid: string): RefUuidMap => {
    let map = bucket.get(rexUuid);
    if (!map) {
      map = new Map();
      bucket.set(rexUuid, map);
    }
    return map;
  };

  // Stations
  for (const station of Object.values(mission.stations ?? {})) {
    if (!station.refUuid) continue;
    const rexUuid = rexUuidBySequenceUuid.get(station.uuid);
    if (rexUuid) {
      getRexMap(maps.rexStations, rexUuid).set(station.refUuid, station.uuid);
    } else {
      maps.asPlannedStations.set(station.refUuid, station.uuid);
    }
  }

  // Traverses
  for (const traverse of Object.values(mission.traverses ?? {})) {
    if (!traverse.refUuid) continue;
    const rexUuid = rexUuidBySequenceUuid.get(traverse.uuid);
    if (rexUuid) {
      getRexMap(maps.rexTraverses, rexUuid).set(traverse.refUuid, traverse.uuid);
    } else {
      maps.asPlannedTraverses.set(traverse.refUuid, traverse.uuid);
    }
  }

  // Actions — an action belongs to whatever scope its parent
  // (station or traverse) belongs to. An action never exists in isolation, so
  // its parent uuid determines the scope.
  for (const action of Object.values(mission.actions ?? {})) {
    if (!action.refUuid) continue;
    const parentUuid = action.stationUuid ?? action.traverseUuid ?? null;
    if (parentUuid) {
      const parentEvaUuids = maps.evaUuidsByUuid.get(parentUuid);
      if (parentEvaUuids) {
        for (const evaUuid of parentEvaUuids) addToEvaUuid(action.uuid, evaUuid);
      }
    }
    const rexUuid = parentUuid ? rexUuidBySequenceUuid.get(parentUuid) : undefined;
    if (rexUuid) {
      getRexMap(maps.rexActions, rexUuid).set(action.refUuid, action.uuid);
    } else {
      maps.asPlannedActions.set(action.refUuid, action.uuid);
    }
  }

  return maps;
};

/** Resolve a station refUuid → uuid within the given rex scope (null = as-planned). */
export const resolveStationUuid = (
  maps: MdauRefUuidMaps,
  refUuid: string,
  rexUuid: string | null
): string | undefined => {
  if (rexUuid) return maps.rexStations.get(rexUuid)?.get(refUuid);
  return maps.asPlannedStations.get(refUuid);
};

/** Resolve a traverse refUuid → uuid within the given rex scope (null = as-planned). */
export const resolveTraverseUuid = (
  maps: MdauRefUuidMaps,
  refUuid: string,
  rexUuid: string | null
): string | undefined => {
  if (rexUuid) return maps.rexTraverses.get(rexUuid)?.get(refUuid);
  return maps.asPlannedTraverses.get(refUuid);
};

/** Resolve an action refUuid → uuid within the given rex scope (null = as-planned). */
export const resolveActionUuid = (
  maps: MdauRefUuidMaps,
  refUuid: string,
  rexUuid: string | null
): string | undefined => {
  if (rexUuid) return maps.rexActions.get(rexUuid)?.get(refUuid);
  return maps.asPlannedActions.get(refUuid);
};

/**
 * Resolve a sequence-item (station OR traverse) refUuid → uuid within a rex
 * scope. Used for rex entry maps where the key may be either type.
 */
export const resolveSequenceUuid = (
  maps: MdauRefUuidMaps,
  refUuid: string,
  rexUuid: string | null
): string | undefined => {
  return resolveStationUuid(maps, refUuid, rexUuid) ?? resolveTraverseUuid(maps, refUuid, rexUuid);
};
