/**
 * checkMissionIntegrity.ts
 *
 * Pure FK integrity checker for Automerge Mission documents.
 * No side effects, no I/O — safe to import in unit tests.
 *
 * Exported and consumed by integrityCheck.ts (the CLI runner).
 */

export type IntegrityFinding = {
  missionId: number;
  missionName: string;
  entity: string;
  entityUuid: string;
  field: string;
  orphanedUuid: string;
};

/**
 * Checks all intra-doc FK references in a Mission Automerge document.
 * Read-only — never logs or mutates the doc. Returns an array of findings.
 */
export function checkMissionIntegrity(missionId: number, doc: Mission): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];

  const log = (field: string, orphanUuid: string, ownerEntity: string, ownerUuid: string) => {
    findings.push({
      missionId,
      missionName: doc.name,
      entity: ownerEntity,
      entityUuid: ownerUuid,
      field,
      orphanedUuid: orphanUuid,
    });
  };

  const actionUuids = new Set(Object.keys(doc.actions ?? {}));
  const stationUuids = new Set(Object.keys(doc.stations ?? {}));
  const traverseUuids = new Set(Object.keys(doc.traverses ?? {}));
  const poiUuids = new Set(Object.keys(doc.pois ?? {}));
  const evaUuids = new Set(Object.keys(doc.evas ?? {}));

  // Mission-level dictionaries — used by Action references
  const equipmentItemUuids = new Set(Object.keys(doc.equipmentItems ?? {}));
  const geographicUnitUuids = new Set(Object.keys(doc.geographicUnits ?? {}));
  const missionPriorityUuids = new Set(Object.keys(doc.missionPriorities ?? {}));
  const verbUuids = new Set(Object.keys(doc.actionDefinitions?.verbs ?? {}));
  const nounUuids = new Set(Object.keys(doc.actionDefinitions?.nouns ?? {}));
  const adjectiveUuids = new Set(Object.keys(doc.actionDefinitions?.adjectives ?? {}));

  // ── POIs ───────────────────────────────────────────────────────────────────
  for (const poi of Object.values(doc.pois ?? {})) {
    for (const uuid of poi.actionOrderUuids ?? []) {
      if (!actionUuids.has(uuid)) log("actionOrderUuids", uuid, "POI", poi.uuid);
    }
  }

  // ── Stations ───────────────────────────────────────────────────────────────
  for (const station of Object.values(doc.stations ?? {})) {
    for (const uuid of station.actionOrderUuids ?? []) {
      if (!actionUuids.has(uuid)) log("actionOrderUuids", uuid, "Station", station.uuid);
    }
    for (const uuid of station.poiUuids ?? []) {
      if (!poiUuids.has(uuid)) log("poiUuids", uuid, "Station", station.uuid);
    }
  }

  // ── Traverses ──────────────────────────────────────────────────────────────
  for (const traverse of Object.values(doc.traverses ?? {})) {
    for (const uuid of traverse.actionOrderUuids ?? []) {
      if (!actionUuids.has(uuid)) log("actionOrderUuids", uuid, "Traverse", traverse.uuid);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  for (const action of Object.values(doc.actions ?? {})) {
    if (action.poiUuid && !poiUuids.has(action.poiUuid)) {
      log("poiUuid", action.poiUuid, "Action", action.uuid);
    }
    if (action.stationUuid && !stationUuids.has(action.stationUuid)) {
      log("stationUuid", action.stationUuid, "Action", action.uuid);
    }
    if (action.traverseUuid && !traverseUuids.has(action.traverseUuid)) {
      log("traverseUuid", action.traverseUuid, "Action", action.uuid);
    }
    if (action.parentActionUuid && !actionUuids.has(action.parentActionUuid)) {
      log("parentActionUuid", action.parentActionUuid, "Action", action.uuid);
    }
    for (const uuid of Object.keys(action.equipmentItemsUsage ?? {})) {
      if (!equipmentItemUuids.has(uuid)) log("equipmentItemsUsage", uuid, "Action", action.uuid);
    }
    for (const uuid of action.geographicUnitsUsage ?? []) {
      if (!geographicUnitUuids.has(uuid)) log("geographicUnitsUsage", uuid, "Action", action.uuid);
    }
    if (action.missionPriorityUuid && !missionPriorityUuids.has(action.missionPriorityUuid)) {
      log("missionPriorityUuid", action.missionPriorityUuid, "Action", action.uuid);
    }
    if (action.actionDefinition) {
      const { verbUuid, nounUuid, adjectiveUuid } = action.actionDefinition;
      if (verbUuid && !verbUuids.has(verbUuid))
        log("actionDefinition.verbUuid", verbUuid, "Action", action.uuid);
      if (nounUuid && !nounUuids.has(nounUuid))
        log("actionDefinition.nounUuid", nounUuid, "Action", action.uuid);
      if (adjectiveUuid && !adjectiveUuids.has(adjectiveUuid))
        log("actionDefinition.adjectiveUuid", adjectiveUuid, "Action", action.uuid);
    }
  }

  // ── EVAs ───────────────────────────────────────────────────────────────────
  for (const eva of Object.values(doc.evas ?? {})) {
    // Guard against falsy uuids — empty-string entries in sequence are invalid data,
    // not missing entities, and should not be reported as orphans.
    for (const item of eva.sequence ?? []) {
      if (!item.uuid) continue;
      if (item.type === "station" && !stationUuids.has(item.uuid)) {
        log("sequence[].uuid (station)", item.uuid, "EVA", eva.uuid);
      } else if (item.type === "traverse" && !traverseUuids.has(item.uuid)) {
        log("sequence[].uuid (traverse)", item.uuid, "EVA", eva.uuid);
      }
    }

    // The sequence must alternate station/traverse and start/end with
    // egress and ingress stations.
    const sequence = eva.sequence ?? [];
    if (sequence.length > 0) {
      const expectedShape =
        sequence.length % 2 === 1 &&
        sequence.every((item, i) => item.type === (i % 2 === 0 ? "station" : "traverse"));
      if (!expectedShape) {
        log("sequence[] (shape)", `length=${sequence.length}`, "EVA", eva.uuid);
      }
    }
  }

  // ── Rexes ──────────────────────────────────────────────────────────────────
  for (const rex of Object.values(doc.rexes ?? {})) {
    if (rex.evaUuid && !evaUuids.has(rex.evaUuid)) {
      log("evaUuid", rex.evaUuid, "Rex", rex.uuid);
    }
    for (const uuid of Object.keys(rex.stationEntries ?? {})) {
      if (!stationUuids.has(uuid)) log("stationEntries", uuid, "Rex", rex.uuid);
    }
    for (const uuid of Object.keys(rex.traverseEntries ?? {})) {
      if (!traverseUuids.has(uuid)) log("traverseEntries", uuid, "Rex", rex.uuid);
    }
    for (const uuid of Object.keys(rex.actionEntries ?? {})) {
      if (!actionUuids.has(uuid)) log("actionEntries", uuid, "Rex", rex.uuid);
    }
    // Deduplicate: the same orphaned posTypeUuid/posSourceUuid can appear across
    // many posEntries, so collect unique orphans before emitting one finding each.
    const posTypeUuids = new Set((rex.posTypes ?? []).map((pt) => pt.uuid));
    const posSourceUuids = new Set((rex.posSources ?? []).map((ps) => ps.uuid));
    const orphanedPosTypeUuids = new Set<string>();
    const orphanedPosSourceUuids = new Set<string>();
    for (const entry of rex.posEntries ?? []) {
      for (const uuid of entry.posTypeUuids ?? []) {
        if (!posTypeUuids.has(uuid)) orphanedPosTypeUuids.add(uuid);
      }
      if (entry.posSourceUuid && !posSourceUuids.has(entry.posSourceUuid)) {
        orphanedPosSourceUuids.add(entry.posSourceUuid);
      }
    }
    for (const uuid of orphanedPosTypeUuids) {
      log("posEntries[].posTypeUuids", uuid, "Rex", rex.uuid);
    }
    for (const uuid of orphanedPosSourceUuids) {
      log("posEntries[].posSourceUuid", uuid, "Rex", rex.uuid);
    }
  }

  // ── Map layers and presets ────────────────────────────────────────────────
  const layerUuids = new Set(Object.keys(doc.layers ?? {}));
  const sublayerUuids = new Set(Object.keys(doc.sublayers ?? {}));
  for (const sublayer of Object.values(doc.sublayers ?? {})) {
    if (!layerUuids.has(sublayer.layerUuid)) {
      log("layerUuid", sublayer.layerUuid, "Sublayer", sublayer.uuid);
    }
  }
  for (const preset of Object.values(doc.presets ?? {})) {
    for (const sublayerUuid of Object.keys(preset.mapSublayerControls ?? {})) {
      if (!sublayerUuids.has(sublayerUuid)) {
        log("mapSublayerControls", sublayerUuid, "Preset", preset.uuid);
      }
    }
    for (const entry of preset.layerOrder ?? []) {
      if (!layerUuids.has(entry.layerUuid)) {
        log("layerOrder[].layerUuid", entry.layerUuid, "Preset", preset.uuid);
      }
      for (const sublayerUuid of entry.sublayerUuids ?? []) {
        if (!sublayerUuids.has(sublayerUuid)) {
          log("layerOrder[].sublayerUuids", sublayerUuid, "Preset", preset.uuid);
        }
      }
    }
  }

  // ── STM ───────────────────────────────────────────────────────────────────
  const stmLevel1Uuids = new Set(Object.keys(doc.stmLevel1s ?? {}));
  const stmLevel2Uuids = new Set(Object.keys(doc.stmLevel2s ?? {}));
  const stmLevel3Uuids = new Set(Object.keys(doc.stmLevel3s ?? {}));
  for (const level2 of Object.values(doc.stmLevel2s ?? {})) {
    if (!stmLevel1Uuids.has(level2.level1Uuid)) {
      log("level1Uuid", level2.level1Uuid, "STMLevel2", level2.uuid);
    }
  }
  for (const level3 of Object.values(doc.stmLevel3s ?? {})) {
    if (!stmLevel2Uuids.has(level3.level2Uuid)) {
      log("level2Uuid", level3.level2Uuid, "STMLevel3", level3.uuid);
    }
  }
  for (const rule of Object.values(doc.stmRules ?? {})) {
    if (!stmLevel3Uuids.has(rule.stmUuid)) log("stmUuid", rule.stmUuid, "STMRule", rule.uuid);
    for (const uuid of rule.verbUuids ?? []) {
      if (!verbUuids.has(uuid)) log("verbUuids", uuid, "STMRule", rule.uuid);
    }
    for (const uuid of rule.nounUuids ?? []) {
      if (!nounUuids.has(uuid)) log("nounUuids", uuid, "STMRule", rule.uuid);
    }
    for (const uuid of rule.adjectiveUuids ?? []) {
      if (!adjectiveUuids.has(uuid)) log("adjectiveUuids", uuid, "STMRule", rule.uuid);
    }
  }
  for (const action of Object.values(doc.actions ?? {})) {
    for (const stmUuid of Object.keys(action.stmPriorities ?? {})) {
      if (!stmLevel3Uuids.has(stmUuid)) log("stmPriorities", stmUuid, "Action", action.uuid);
    }
  }

  // ── Folders ───────────────────────────────────────────────────────────────
  const folderTargetUuids: Record<FolderType, Set<string>> = {
    poi: poiUuids,
    station: stationUuids,
    eva: evaUuids,
    preset: new Set(Object.keys(doc.presets ?? {})),
    layer: layerUuids,
  };
  for (const folder of Object.values(doc.folders ?? {})) {
    const targets = folderTargetUuids[folder.type];
    for (const itemUuid of folder.items ?? []) {
      if (!targets?.has(itemUuid)) log("items", itemUuid, "Folder", folder.uuid);
    }
  }

  return findings;
}
