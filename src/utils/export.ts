import { decodeEmoji } from "./formatting";
import { buildActionDefinitionName } from "store/storeUtils/mission";
import { getGridCoordinatesFromPoint } from "./mapping/geoMath";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByPoi,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";
import { getServerFileGrid } from "./mapping/grid";
import * as jsonKeysSort from "json-keys-sort";

/**
 * Exported LGRS/ACC coordinate fields use getGridCoordinatesFromPoint(), which
 * delegates to the reference-corpus-verified utils/lgrs display path for LGRS missions.
 */

export const makeEquipmentReadable = (params: {
  equipmentItems: EquipmentItemUsages;
  mission: Mission;
}): EquipmentItemUsageReadable[] => {
  const { equipmentItems, mission } = params;
  if (!equipmentItems || Object.keys(equipmentItems).length === 0) return [];
  const equipmentItemsUsageReadable: EquipmentItemUsageReadable[] = Object.entries(
    equipmentItems
  ).map(([uuid, equipmentItemUsage]) => {
    const equipmentItemUsageReadable: EquipmentItemUsageReadable = {
      name: mission.equipmentItems?.[uuid]?.name,
      singleUse: mission.equipmentItems?.[uuid]?.singleUse,
      quantityUsed: equipmentItemUsage.quantityUsed,
    };
    return equipmentItemUsageReadable;
  });
  return equipmentItemsUsageReadable;
};

export const makeExportActions = (params: {
  actions: Action[];
  mission: Mission;
  missionGrid: MissionGridPoint[][];
}): ExportAction[] => {
  const { actions, mission, missionGrid } = params;
  if (!actions || actions.length === 0) return [];
  const evaUuidToRexUuid = Object.fromEntries(
    Object.values(mission.rexes).map((r) => [r.evaUuid, r.uuid])
  );

  const exportActions: ExportAction[] = actions.map((action) => {
    let rexUuid = null;
    const actionStation = action.stationUuid ? mission.stations[action.stationUuid] : null;
    const actionTraverse = action.traverseUuid ? mission.traverses[action.traverseUuid] : null;
    if (actionStation || actionTraverse) {
      // Use a "find" instead of "filter" because if this station is in more than one EVA
      //  then we know it's an as-planned station and it will fail when it tries to find the rex
      // Traverses can only be in one EVA
      const evaThisStationOrTraverseIsIn = Object.values(mission.evas).find((eva) =>
        eva.sequence.some(
          (seqItem) => seqItem.uuid === (actionStation?.uuid || actionTraverse?.uuid)
        )
      );
      if (evaThisStationOrTraverseIsIn) {
        // Check if this eva is in a rex
        rexUuid = evaUuidToRexUuid[evaThisStationOrTraverseIsIn.uuid] ?? null;
      }
    }

    const exportAction: ExportAction = {
      ...action,
      _itemType: "Action",
      parentPoiName: mission.pois[action.poiUuid]?.name,
      parentStationName: actionStation?.name,
      parentTraverseName: actionTraverse?.name,
      stationRefUuid: actionStation?.refUuid,
      traverseRefUuid: actionTraverse?.refUuid,
      iconEmojiDecoded: decodeEmoji(action.icon),
      equipmentItemsUsageReadable: makeEquipmentReadable({
        equipmentItems: action.equipmentItemsUsage,
        mission,
      }),
      geographicalUnitsReadable: action.geographicUnitsUsage
        ? [...action.geographicUnitsUsage].map((geographicUnitUsageUuid) => {
            return mission.geographicUnits?.[geographicUnitUsageUuid]?.name;
          })
        : null,
      //Verb of noun in adjective
      actionDefinitionReadable: makeReadableActionDefinition({
        action,
        mission,
      }),
      stmPrioritiesReadable: action.stmPriorities
        ? Object.entries(action.stmPriorities).map(([uuid, priority]) => ({
            uuid,
            priority,
          }))
        : null,
      gridCoordinates: getGridCoordinatesFromPoint(
        action.location,
        mission.planetRadius,
        mission.usingLGRSCoordinates,
        missionGrid
      ),
      rexUuid,
    };
    return exportAction;
  });

  return exportActions;
};

export const makeExportPois = (params: {
  pois: POI[];
  missionGrid: MissionGridPoint[][];
  mission: Mission;
}): ExportPOI[] => {
  const { pois, mission, missionGrid } = params;
  if (!pois || pois.length === 0) return [];
  const exportPois: ExportPOI[] = pois.map((poi) => {
    const actionsReadable: ExportAction[] = makeExportActions({
      actions: Object.values(mission.actions).filter((a) => poi.actionOrderUuids?.includes(a.uuid)),
      mission,
      missionGrid,
    });
    const poiActions = Object.values(mission.actions).filter(
      (a) => a.poiUuid === poi.uuid && a.enabled
    );
    const poiCalculatedFields = getCalculatedFieldsByPoi({
      poiUuid: poi.uuid,
      poiActions,
    });
    const exportPoi: ExportPOI = {
      ...poi,
      _itemType: "POI",
      actionsReadable,
      calculatedFields: poiCalculatedFields,
      elevationRelative: poi.elevation - mission.landerElevationMeters,
      iconEmojiDecoded: decodeEmoji(poi.icon),
      gridCoordinates: getGridCoordinatesFromPoint(
        poi.location,
        mission.planetRadius,
        mission.usingLGRSCoordinates,
        missionGrid
      ),
    };
    return exportPoi;
  });
  return exportPois;
};

export const makeExportStations = (params: {
  stations: Station[];
  missionGrid: MissionGridPoint[][];
  mission: Mission;
  exportActions?: boolean;
}): ExportStation[] => {
  const { stations, mission, missionGrid, exportActions = true } = params;
  if (!stations || stations.length === 0) return [];
  const evaUuidToRexUuid = Object.fromEntries(
    Object.values(mission.rexes).map((r) => [r.evaUuid, r.uuid])
  );
  const exportStations: ExportStation[] = stations.map((station) => {
    const stationActions = Object.values(mission.actions).filter(
      (a) => a.stationUuid === station.uuid && a.enabled
    );
    const stationCalculatedFields = getCalculatedFieldsByStation({
      station,
      missionWalkbackRate: mission.walkbackRate,
      stationActions,
    });
    let actionsReadable: ExportAction[] = null;
    if (exportActions) {
      actionsReadable = makeExportActions({
        actions: Object.values(mission.actions).filter((a) =>
          station.actionOrderUuids?.includes(a.uuid)
        ),
        mission,
        missionGrid,
      });
    }
    let rexUuid = null;
    // Use a "find" instead of "filter" because if this station is in more than one EVA
    //  then we know it's an as-planned station and it will fail when it tries to find the rex
    const evaThisStationIsIn = Object.values(mission.evas).find((eva) =>
      eva.sequence.some((seqItem) => seqItem.type === "station" && seqItem.uuid === station.uuid)
    );
    if (evaThisStationIsIn) {
      // Check if this eva is in a rex
      rexUuid = evaUuidToRexUuid[evaThisStationIsIn.uuid] ?? null;
    }

    const ExportStation: ExportStation = {
      ...station,
      _itemType: "Station",
      actionsReadable,
      calculatedFields: {
        ...stationCalculatedFields,
        equipmentItemsReadable: makeEquipmentReadable({
          equipmentItems: stationCalculatedFields.equipmentItems,
          mission,
        }),
      } as ExportStationCalculatedFields,
      elevationRelative: station.elevation - mission.landerElevationMeters,
      iconEmojiDecoded: decodeEmoji(station.icon),
      poisAssociatedReadable: station.poiUuids?.map((poiUuid) => {
        const poi = mission.pois[poiUuid];
        if (poi) {
          return {
            name: poi.name,
            description: poi.description,
          };
        }
      }),
      gridCoordinates: getGridCoordinatesFromPoint(
        station.location,
        mission.planetRadius,
        mission.usingLGRSCoordinates,
        missionGrid
      ),
      actionOrderRefUuids: station.actionOrderUuids?.map(
        (actionOrderUuid) => mission.actions[actionOrderUuid]?.refUuid
      ),
      rexUuid,
    };
    return ExportStation;
  });
  return exportStations;
};

export const makeExportTraverses = (params: {
  traverses: Traverse[];
  missionGrid: MissionGridPoint[][];
  mission: Mission;
  exportActions?: boolean;
}): ExportTraverse[] => {
  const { traverses, mission, missionGrid, exportActions = true } = params;
  if (!traverses || traverses.length === 0) return [];
  const evaUuidToRexUuid = Object.fromEntries(
    Object.values(mission.rexes).map((r) => [r.evaUuid, r.uuid])
  );
  const exportTraverses: ExportTraverse[] = traverses.map((traverse) => {
    const traverseEva = Object.values(mission.evas).find((eva) =>
      eva.sequence.some((seqItem) => seqItem.uuid === traverse.uuid)
    );
    const traverseActions = Object.values(mission.actions).filter(
      (a) => a.traverseUuid === traverse.uuid && a.enabled
    );
    const traverseCalculatedFields = getCalculatedFieldsByTraverse({
      traverse: traverse,
      missionTraverseRate: mission.traverseRate,
      evaTraverseRate: traverseEva?.traverseRate,
      traverseActions,
    });
    let actionsReadable: ExportAction[] = null;
    if (exportActions) {
      actionsReadable = makeExportActions({
        actions: Object.values(mission.actions).filter((a) =>
          traverse.actionOrderUuids?.includes(a.uuid)
        ),
        mission,
        missionGrid,
      });
    }
    let rexUuid = null;
    const evaThisTraverseIsIn = Object.values(mission.evas).find((eva) =>
      eva.sequence.some((seqItem) => seqItem.type === "traverse" && seqItem.uuid === traverse.uuid)
    );
    if (evaThisTraverseIsIn) {
      // Check if this eva is in a rex
      rexUuid = evaUuidToRexUuid[evaThisTraverseIsIn.uuid] ?? null;
    }

    return {
      ...traverse,
      _itemType: "Traverse",
      calculatedFields: traverseCalculatedFields,
      actionsReadable: actionsReadable,
      actionOrderRefUuids: traverse.actionOrderUuids?.map(
        (actionOrderUuid) => mission.actions[actionOrderUuid]?.refUuid
      ),
      rexUuid,
    };
  });
  return exportTraverses;
};

export const makeExportEvas = (params: {
  evas: Eva[];
  missionGrid: MissionGridPoint[][];
  mission: Mission;
  exportStations?: boolean;
  exportTraverses?: boolean;
}): ExportEva[] => {
  const { evas, mission, missionGrid, exportStations = true, exportTraverses = true } = params;
  if (!evas || evas.length === 0) return [];
  const evaUuidToRexUuid = Object.fromEntries(
    Object.values(mission.rexes).map((r) => [r.evaUuid, r.uuid])
  );
  const exportEvas: ExportEva[] = evas.map((eva) => {
    const seqStationUuids = new Set(
      eva.sequence.filter((s) => s.type === "station").map((s) => s.uuid)
    );
    const seqTraverseUuids = new Set(
      eva.sequence.filter((s) => s.type === "traverse").map((s) => s.uuid)
    );
    const evaCalculatedFields = getCalculatedFieldsByEva({
      eva,
      evaStations: Object.values(mission.stations).filter((s) => seqStationUuids.has(s.uuid)),
      missionTraverseRate: mission.traverseRate,
      missionWalkbackRate: mission.walkbackRate,
      evaActions: Object.values(mission.actions).filter(
        (a) => seqStationUuids.has(a.stationUuid) || seqTraverseUuids.has(a.traverseUuid)
      ),
      evaTraverses: Object.values(mission.traverses).filter((t) => seqTraverseUuids.has(t.uuid)),
    });
    const rexUuid = evaUuidToRexUuid[eva.uuid] ?? null;

    const exportEva: ExportEva = {
      ...eva,
      _itemType: "EVA",
      sequenceReadable: eva.sequence.map((sequenceItem) => {
        if (sequenceItem.type === "station" && exportStations) {
          return makeExportStations({
            // Use filter(Boolean) to filter out nulls in case the station is missing (shouldn't happen but just in case)
            stations: [mission.stations[sequenceItem.uuid]].filter(Boolean) as Station[],
            mission,
            missionGrid,
          })[0];
        } else if (sequenceItem.type === "traverse" && exportTraverses) {
          return makeExportTraverses({
            traverses: [mission.traverses[sequenceItem.uuid]].filter(Boolean) as Traverse[],
            mission,
            missionGrid,
          })[0];
        } else {
          return null;
        }
      }),
      sequenceRefUuids: eva.sequence.map((sequenceItem) => {
        let refUuid = "";
        if (sequenceItem.type === "station") {
          refUuid = mission.stations[sequenceItem.uuid]?.refUuid;
        } else if (sequenceItem.type === "traverse") {
          refUuid = mission.traverses[sequenceItem.uuid]?.refUuid;
        }
        const sequenceRefUuid: EvaSequenceItemRefUuid = {
          ...sequenceItem,
          refUuid: refUuid,
        };
        return sequenceRefUuid;
      }),
      egressLocationRefUuid:
        eva.egressLocationUuid === "lander"
          ? "lander"
          : mission.stations[eva.egressLocationUuid]?.refUuid,
      ingressLocationRefUuid:
        eva.ingressLocationUuid === "lander"
          ? "lander"
          : mission.stations[eva.ingressLocationUuid]?.refUuid,
      calculatedFields: {
        ...evaCalculatedFields,
        equipmentItemsReadable: makeEquipmentReadable({
          equipmentItems: evaCalculatedFields.equipmentItems,
          mission,
        }),
      },
      rexUuid,
    };
    return exportEva;
  });

  return exportEvas;
};

export const makeExportRexString = ({ rex }: { rex: Rex }): string => {
  // Build the full export object for the rex
  const exportRex: ExportRex[] = makeExportRexes({ rexes: [rex] });
  const selectedExportedData = { rex: exportRex };
  // Convert object to readable string
  const sortedJson = jsonKeysSort.sort(selectedExportedData);
  const dataStr = JSON.stringify(sortedJson, null, 2);
  return dataStr;
};

export const makeExportRexes = (params: { rexes: Rex[] }): ExportRex[] => {
  const { rexes } = params;
  if (!rexes || rexes.length === 0) return [];
  const exportRexes: ExportRex[] = rexes.map((rex) => {
    const exportRex: ExportRex = {
      ...rex,
      _itemType: "Rex",
    };
    return exportRex;
  });
  return exportRexes;
};

export const makeExportMission = (params: {
  mission: Mission;
  missionGrid: MissionGridPoint[][];
}): ExportMission => {
  const { mission, missionGrid } = params;
  if (!mission) throw new Error("Mission is required to export");
  const exportMission: ExportMission = {
    ...mission,
    gridCoordinates: getGridCoordinatesFromPoint(
      mission.landerLocation,
      mission.planetRadius,
      mission.usingLGRSCoordinates,
      missionGrid
    ),
  };

  return exportMission;
};

export const makeReadableActionDefinition = (params: {
  action: Action;
  mission: Pick<Mission, "actionDefinitions" | "actionDefinitionConjunctions">;
}): ActionDefinitionReadable => {
  const { action, mission } = params;
  if (!action?.actionDefinition) return null;
  const actionDefinitions = mission.actionDefinitions;
  const conjunctions = mission.actionDefinitionConjunctions;

  const verbUuid = action.actionDefinition.verbUuid;
  const nounUuid = action.actionDefinition.nounUuid;
  const adjectiveUuid = action.actionDefinition.adjectiveUuid;

  const verb = verbUuid ? { uuid: verbUuid, ...actionDefinitions.verbs[verbUuid] } : null;
  const noun = nounUuid ? { uuid: nounUuid, ...actionDefinitions.nouns[nounUuid] } : null;
  const adjective = adjectiveUuid
    ? { uuid: adjectiveUuid, ...actionDefinitions.adjectives[adjectiveUuid] }
    : null;

  const readableActionDefinition: ActionDefinitionReadable = {
    displayString: buildActionDefinitionName({
      verbName: verb?.name,
      nounName: noun?.name,
      adjectiveName: adjective?.name,
      conjunctions,
    }),
    verb: verb,
    noun: noun,
    adjective: adjective,
  };
  return readableActionDefinition;
};

export const makeExportString = ({
  mission,
  selectEvas,
  selectMission,
  selectPois,
  selectStations,
  selectActions,
  selectTraverses,
  selectRexes,
}: {
  mission: Mission;
  selectEvas: boolean;
  selectMission: boolean;
  selectPois: boolean;
  selectStations: boolean;
  selectActions: boolean;
  selectTraverses: boolean;
  selectRexes: boolean;
}): string => {
  if (!mission) return "";
  let selectedExportedData = {};
  const missionGrid = getServerFileGrid(mission.gridRenderMode)?.coordinates;

  /**
   * Mission
   */
  if (selectMission) {
    const exportMission = makeExportMission({
      mission,
      missionGrid,
    });
    selectedExportedData = { ...selectedExportedData, exportMission };
  }

  /**
   * Actions
   */
  if (selectActions) {
    const actions: ExportAction[] = makeExportActions({
      actions: Object.values(mission?.actions ?? {}),
      mission,
      missionGrid,
    });
    selectedExportedData = { ...selectedExportedData, actions };
  }
  /**
   * POIs
   */
  if (selectPois) {
    const pois: ExportPOI[] = makeExportPois({
      pois: Object.values(mission?.pois ?? {}),
      missionGrid,
      mission,
    });
    selectedExportedData = { ...selectedExportedData, pois };
  }
  /**
   * Stations
   */
  if (selectStations) {
    const stations: ExportStation[] = makeExportStations({
      stations: Object.values(mission?.stations ?? {}),
      missionGrid,
      mission,
    });
    selectedExportedData = { ...selectedExportedData, stations };
  }
  /**
   * Traverses
   */
  if (selectTraverses) {
    const traverses: ExportTraverse[] = makeExportTraverses({
      traverses: Object.values(mission?.traverses ?? {}),
      missionGrid,
      mission,
    });
    selectedExportedData = { ...selectedExportedData, traverses };
  }
  /**
   * EVAs
   */
  if (selectEvas) {
    const evas: ExportEva[] = makeExportEvas({
      evas: Object.values(mission?.evas ?? {}),
      missionGrid,
      mission,
    });
    selectedExportedData = { ...selectedExportedData, evas };
  }
  /**
   * REXes
   */
  if (selectRexes) {
    const rexes: ExportRex[] = makeExportRexes({
      rexes: Object.values(mission?.rexes ?? {}),
    });
    selectedExportedData = { ...selectedExportedData, rexes };
  }

  // convert object to readable string
  const sortedJson = jsonKeysSort.sort(selectedExportedData);
  const dataStr = JSON.stringify(sortedJson, null, 2);

  return dataStr;
};
