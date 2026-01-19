import { decodeEmoji } from "./formatting";
import { getGridCoordinatesFromPoint } from "./mapping/geoMath";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByPoi,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";

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
  allData: AllDataForExport;
  missionGrid: MissionGridPoint[][];
}): ExportAction[] => {
  const { actions, allData, missionGrid } = params;
  if (!actions || actions.length === 0) return [];
  const actionDefinitions: ActionDefinitions = allData.mission.actionDefinitions;

  const exportActions: ExportAction[] = actions.map((action) => {
    let rexUuid = null;
    const actionStation = action.stationUuid
      ? allData.stations.find((s) => s.uuid === action.stationUuid)
      : null;
    const actionTraverse = action.traverseUuid
      ? allData.traverses.find((t) => t.uuid === action.traverseUuid)
      : null;
    if (actionStation || actionTraverse) {
      // Use a "find" instead of "filter" because if this station is in more than one EVA
      //  then we know it's an as-planned station and it will fail when it tries to find the rex
      // Traverses can only be in one EVA
      const evaThisStationOrTraverseIsIn = allData.evas.find((eva) =>
        eva.sequence.some(
          (seqItem) => seqItem.uuid === (actionStation?.uuid || actionTraverse?.uuid)
        )
      );
      if (evaThisStationOrTraverseIsIn) {
        // check if this eva is in a rex
        const rex = allData.rexes.find((r) => r.evaUuid === evaThisStationOrTraverseIsIn.uuid);
        if (rex) rexUuid = rex.uuid;
      }
    }

    const exportAction: ExportAction = {
      ...action,
      _itemType: "Action",
      parentPoiName: allData.pois.find((p) => p.uuid === action.poiUuid)?.name,
      parentStationName: actionStation?.name,
      parentTraverseName: actionTraverse?.name,
      stationRefUuid: actionStation?.refUuid,
      traverseRefUuid: actionTraverse?.refUuid,
      iconEmojiDecoded: decodeEmoji(action.icon),
      equipmentItemsUsageReadable: makeEquipmentReadable({
        equipmentItems: action.equipmentItemsUsage,
        mission: allData.mission,
      }),
      geographicalUnitsReadable: action.geographicUnitsUsage
        ? [...action.geographicUnitsUsage].map((geographicUnitUsageUuid) => {
            return allData.mission.geographicUnits?.[geographicUnitUsageUuid]?.name;
          })
        : null,
      //Verb of noun in adjective
      actionDefinitionReadable: makeReadableActionDefinition({
        action,
        actionDefinitions,
      }),
      stmPrioritiesReadable: action.stmPriorities
        ? Object.entries(action.stmPriorities).map(([uuid, priority]) => ({
            uuid,
            priority,
          }))
        : null,
      gridCoordinates: getGridCoordinatesFromPoint(
        action.location,
        allData.mission.planetRadius,
        allData.mission.usingLGRSCoordinates,
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
  allData: AllDataForExport;
}): ExportPOI[] => {
  const { pois, allData, missionGrid } = params;
  if (!pois || pois.length === 0) return [];
  const exportPois: ExportPOI[] = pois.map((poi) => {
    const actionsReadable: ExportAction[] = makeExportActions({
      actions: allData.actions.filter((a) => poi.actionOrderUuids?.includes(a.uuid)),
      allData,
      missionGrid,
    });
    const poiActions = allData.actions.filter((a) => a.poiUuid === poi.uuid && a.enabled);
    const poiCalculatedFields = getCalculatedFieldsByPoi({
      poiUuid: poi.uuid,
      poiActions,
    });
    const exportPoi: ExportPOI = {
      ...poi,
      _itemType: "POI",
      actionsReadable,
      calculatedFields: poiCalculatedFields,
      elevationRelative: poi.elevation - allData.mission.landerElevationMeters,
      iconEmojiDecoded: decodeEmoji(poi.icon),
      gridCoordinates: getGridCoordinatesFromPoint(
        poi.location,
        allData.mission.planetRadius,
        allData.mission.usingLGRSCoordinates,
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
  allData: AllDataForExport;
  exportActions?: boolean;
}): ExportStation[] => {
  const { stations, allData, missionGrid, exportActions = true } = params;
  if (!stations || stations.length === 0) return [];
  const exportStations: ExportStation[] = stations.map((station) => {
    const stationActions = allData.actions.filter(
      (a) => a.stationUuid === station.uuid && a.enabled
    );
    const stationCalculatedFields = getCalculatedFieldsByStation({
      station,
      missionWalkbackRate: allData.mission.walkbackRate,
      stationActions,
    });
    let actionsReadable: ExportAction[] = null;
    if (exportActions) {
      actionsReadable = makeExportActions({
        actions: allData.actions.filter((a) => station.actionOrderUuids?.includes(a.uuid)),
        allData,
        missionGrid,
      });
    }
    let rexUuid = null;
    // Use a "find" instead of "filter" because if this station is in more than one EVA
    //  then we know it's an as-planned station and it will fail when it tries to find the rex
    const evaThisStationIsIn = allData.evas.find((eva) =>
      eva.sequence.some((seqItem) => seqItem.type === "station" && seqItem.uuid === station.uuid)
    );
    if (evaThisStationIsIn) {
      // Check if this eva is in a rex
      const rex = allData.rexes.find((r) => r.evaUuid === evaThisStationIsIn.uuid);
      if (rex) rexUuid = rex.uuid;
    }

    const ExportStation: ExportStation = {
      ...station,
      _itemType: "Station",
      actionsReadable,
      calculatedFields: {
        ...stationCalculatedFields,
        equipmentItemsReadable: makeEquipmentReadable({
          equipmentItems: stationCalculatedFields.equipmentItems,
          mission: allData.mission,
        }),
      } as ExportStationCalculatedFields,
      elevationRelative: station.elevation - allData.mission.landerElevationMeters,
      iconEmojiDecoded: decodeEmoji(station.icon),
      poisAssociatedReadable: station.poiUuids?.map((poiUuid) => {
        const poi = allData.pois.find((p) => p.uuid === poiUuid);
        if (poi) {
          return {
            name: poi.name,
            description: poi.description,
          };
        }
      }),
      gridCoordinates: getGridCoordinatesFromPoint(
        station.location,
        allData.mission.planetRadius,
        allData.mission.usingLGRSCoordinates,
        missionGrid
      ),
      actionOrderRefUuids: station.actionOrderUuids?.map(
        (actionOrderUuid) => allData.actions.find((a) => a.uuid === actionOrderUuid)?.refUuid
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
  allData: AllDataForExport;
  exportActions?: boolean;
}): ExportTraverse[] => {
  const { traverses, allData, missionGrid, exportActions = true } = params;
  if (!traverses || traverses.length === 0) return [];
  const exportTraverses: ExportTraverse[] = traverses.map((traverse) => {
    const traverseEva = allData.evas.find((eva) =>
      eva.sequence.some((seqItem) => seqItem.uuid === traverse.uuid)
    );
    const traverseActions = allData.actions.filter(
      (a) => a.traverseUuid === traverse.uuid && a.enabled
    );
    const traverseCalculatedFields = getCalculatedFieldsByTraverse({
      traverse: traverse,
      missionTraverseRate: allData.mission.traverseRate,
      evaTraverseRate: traverseEva?.traverseRate,
      traverseActions,
    });
    let actionsReadable: ExportAction[] = null;
    if (exportActions) {
      actionsReadable = makeExportActions({
        actions: allData.actions.filter((a) => traverse.actionOrderUuids?.includes(a.uuid)),
        allData,
        missionGrid,
      });
    }
    let rexUuid = null;
    const evaThisTraverseIsIn = allData.evas.find((eva) =>
      eva.sequence.some((seqItem) => seqItem.type === "traverse" && seqItem.uuid === traverse.uuid)
    );
    if (evaThisTraverseIsIn) {
      // Check if this eva is in a rex
      const rex = allData.rexes.find((r) => r.evaUuid === evaThisTraverseIsIn.uuid);
      if (rex) rexUuid = rex.uuid;
    }

    return {
      ...traverse,
      _itemType: "Traverse",
      calculatedFields: traverseCalculatedFields,
      actionsReadable: actionsReadable,
      actionOrderRefUuids: traverse.actionOrderUuids?.map(
        (actionOrderUuid) => allData.actions.find((a) => a.uuid === actionOrderUuid)?.refUuid
      ),
      rexUuid,
    };
  });
  return exportTraverses;
};

export const makeExportEvas = (params: {
  evas: Eva[];
  missionGrid: MissionGridPoint[][];
  allData: AllDataForExport;
  exportStations?: boolean;
  exportTraverses?: boolean;
}): ExportEva[] => {
  const { evas, allData, missionGrid, exportStations = true, exportTraverses = true } = params;
  if (!evas || evas.length === 0) return [];
  const exportEvas: ExportEva[] = evas.map((eva) => {
    const evaCalculatedFields = getCalculatedFieldsByEva({
      eva,
      evaStations: allData.stations,
      missionTraverseRate: allData.mission.traverseRate,
      missionWalkbackRate: allData.mission.walkbackRate,
      evaActions: allData.actions,
      evaTraverses: allData.traverses,
    });
    let rexUuid = null;
    const rex = allData.rexes.find((r) => r.evaUuid === eva.uuid);
    if (rex) rexUuid = rex.uuid;

    const exportEva: ExportEva = {
      ...eva,
      _itemType: "EVA",
      sequenceReadable: eva.sequence.map((sequenceItem) => {
        if (sequenceItem.type === "station" && exportStations) {
          return makeExportStations({
            stations: allData.stations.filter((s) => s.uuid === sequenceItem.uuid),
            allData,
            missionGrid,
          })[0];
        } else if (sequenceItem.type === "traverse" && exportTraverses) {
          return makeExportTraverses({
            traverses: allData.traverses.filter((t) => t.uuid === sequenceItem.uuid),
            allData,
            missionGrid,
          })[0];
        } else {
          return null;
        }
      }),
      sequenceRefUuids: eva.sequence.map((sequenceItem) => {
        let refUuid = "";
        if (sequenceItem.type === "station") {
          refUuid = allData.stations.find((s) => s.uuid === sequenceItem.uuid)?.refUuid;
        } else if (sequenceItem.type === "traverse") {
          refUuid = allData.traverses.find((t) => t.uuid === sequenceItem.uuid)?.refUuid;
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
          : allData.stations.find((s) => s.uuid === eva.egressLocationUuid)?.refUuid,
      ingressLocationRefUuid:
        eva.ingressLocationUuid === "lander"
          ? "lander"
          : allData.stations.find((s) => s.uuid === eva.ingressLocationUuid)?.refUuid,
      calculatedFields: {
        ...evaCalculatedFields,
        equipmentItemsReadable: makeEquipmentReadable({
          equipmentItems: evaCalculatedFields.equipmentItems,
          mission: allData.mission,
        }),
      },
      rexUuid,
    };
    return exportEva;
  });

  return exportEvas;
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
  actionDefinitions: ActionDefinitions;
}): ActionDefinitionReadable => {
  const { action, actionDefinitions } = params;
  if (!action?.actionDefinition) return null;

  const verbUuid = action.actionDefinition.verbUuid;
  const nounUuid = action.actionDefinition.nounUuid;
  const adjectiveUuid = action.actionDefinition.adjectiveUuid;

  const verb = verbUuid ? { uuid: verbUuid, ...actionDefinitions.verbs[verbUuid] } : null;
  const noun = nounUuid ? { uuid: nounUuid, ...actionDefinitions.nouns[nounUuid] } : null;
  const adjective = adjectiveUuid
    ? { uuid: adjectiveUuid, ...actionDefinitions.adjectives[adjectiveUuid] }
    : null;

  const readableActionDefinition: ActionDefinitionReadable = {
    displayString: `${verb?.name} of ${noun?.name} in ${adjective?.name}`,
    verb: verb,
    noun: noun,
    adjective: adjective,
  };
  return readableActionDefinition;
};
