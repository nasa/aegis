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
 *
 * In addition to refUuid → uuid resolution, this carries `evaUuidByUuid`:
 * a reverse index from any entity uuid (station/traverse/action/rex/eva) to
 * the EVA uuid that owns it. It is built in the same single pass and used to
 * gate incoming MDAU data by EVA subscription without a second traversal of
 * the doc.
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
   * Any entity uuid (station / traverse / action / rex / eva) → the EVA uuid
   * that owns it. Entities with no resolvable owning EVA are absent.
   */
  evaUuidByUuid: Map<string, string>;
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
    evaUuidByUuid: new Map(),
  };

  // Map every EVA uuid → the rexUuid that owns it (if any). EVAs not present
  // here are as-planned.
  const rexUuidByEvaUuid = new Map<string, string>();
  for (const rex of Object.values(mission.rexes ?? {})) {
    rexUuidByEvaUuid.set(rex.evaUuid, rex.uuid);
    // Rex → its EVA (used for subscription gating).
    maps.evaUuidByUuid.set(rex.uuid, rex.evaUuid);
  }

  // Map every station/traverse uuid → the rexUuid whose EVA sequence contains
  // it (if any). Also captures ingress/egress stations referenced by the EVA.
  // In the same loop, index every entity uuid → its owning EVA uuid.
  const rexUuidBySequenceUuid = new Map<string, string>();
  for (const eva of Object.values(mission.evas ?? {})) {
    // Eva → itself.
    maps.evaUuidByUuid.set(eva.uuid, eva.uuid);

    const rexUuid = rexUuidByEvaUuid.get(eva.uuid);
    for (const seqItem of eva.sequence ?? []) {
      maps.evaUuidByUuid.set(seqItem.uuid, eva.uuid);
      if (rexUuid) rexUuidBySequenceUuid.set(seqItem.uuid, rexUuid);
    }
    if (eva.ingressLocationUuid && eva.ingressLocationUuid !== "lander") {
      maps.evaUuidByUuid.set(eva.ingressLocationUuid, eva.uuid);
      if (rexUuid) rexUuidBySequenceUuid.set(eva.ingressLocationUuid, rexUuid);
    }
    if (eva.egressLocationUuid && eva.egressLocationUuid !== "lander") {
      maps.evaUuidByUuid.set(eva.egressLocationUuid, eva.uuid);
      if (rexUuid) rexUuidBySequenceUuid.set(eva.egressLocationUuid, rexUuid);
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

  // Actions — an action belongs to whatever rex scope its parent
  // (station or traverse) belongs to. An action never exists in isolation, so
  // its parent uuid determines the scope. The owning EVA is likewise inherited
  // from the parent.
  for (const action of Object.values(mission.actions ?? {})) {
    if (!action.refUuid) continue;
    const parentUuid = action.stationUuid ?? action.traverseUuid ?? null;
    if (parentUuid) {
      const parentEvaUuid = maps.evaUuidByUuid.get(parentUuid);
      if (parentEvaUuid) maps.evaUuidByUuid.set(action.uuid, parentEvaUuid);
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
