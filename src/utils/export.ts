import { stripHtml } from "string-strip-html";
import { convertNodeToHTML, convertStringToNodes } from "components/interface/form/wysiwyg";
import { decodeEmoji } from "./formatting";
import reduce from "lodash/reduce";
import { findGridCoordinatesFromPoint } from "./geoMath";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByPoi,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";

const decodeWsywig = (string: string): string => {
  if (!string) return string;

  // convert wysiwyg to html and strip the html tags
  let newString = stripHtml(
    reduce(
      convertStringToNodes(string),
      (htmlString, descendant) => htmlString + convertNodeToHTML(descendant),
      ""
    )
  ).result;
  // remove extra line breaks
  newString = newString.replace(/(\r\n|\n|\r)/gm, "");
  // replace tabs
  newString = newString.replace(/\t/g, " ");
  // replace multiple spaces with single space
  newString = newString.replace(/ +(?= )/g, "");
  return newString;
};

export const getStmNames = (params: {
  stmUuidRefs: string[];
  level3s: STMLevel3[];
  level2s: STMLevel2[];
  level1s: STMLevel1[];
}): string[] => {
  const { stmUuidRefs, level3s, level2s, level1s } = params;
  return stmUuidRefs?.map((stmUuidRef) => {
    const stmLevel3 = level3s.find((s) => s.uuid === stmUuidRef);
    const stmLevel2 = level2s.find((s) => s.uuid === stmLevel3?.level2Uuid);
    const stmLevel1 = level1s.find((s) => s.uuid === stmLevel2?.level1Uuid);
    if (stmLevel3)
      return `${stmLevel1.numbering}${stmLevel2.numbering}${stmLevel3.numbering} ${stmLevel3.name}`;
    return "";
  });
};

export const makeEquipmentReadable = (params: {
  equipmentItems: EquipmentItemUsage[];
  mission: Mission;
}): EquipmentItemUsageReadable[] => {
  const { equipmentItems, mission } = params;
  const equipmentItemsUsageReadable: EquipmentItemUsageReadable[] = equipmentItems?.map(
    (equipmentItem) => {
      const equipmentItemUsageReadable: EquipmentItemUsageReadable = {
        name: mission.equipmentItems.find((e) => e.uuid === equipmentItem.uuid)?.name,
        singleUse: mission.equipmentItems.find((e) => e.uuid === equipmentItem.uuid)?.singleUse,
        quantityUsed: equipmentItem.quantityUsed,
      };
      return equipmentItemUsageReadable;
    }
  );
  return equipmentItemsUsageReadable;
};

export const makeExportActions = (params: {
  actions: Action[];
  allData: AllDataForExport;
  missionGrid: MissionGridPoint[][];
}): ExportAction[] => {
  const { actions, allData, missionGrid } = params;

  const actionDefinitions: ActionDefinitions = allData.mission.actionDefinitions;
  const exportActions: ExportAction[] = actions.map((action) => {
    const exportAction: ExportAction = {
      ...action,
      _itemType: "Action",
      descriptionReadable: decodeWsywig(action.description),
      parentPoiName: allData.pois.find((p) => p.uuid === action.poiUuid)?.name,
      parentStationName: allData.stations.find((s) => s.uuid === action.stationUuid)?.name,
      parentTraverseName: allData.traverses.find((t) => t.uuid === action.traverseUuid)?.name,
      stationRefUuid: allData.stations.find((s) => s.uuid === action.stationUuid)?.refUuid,
      traverseRefUuid: allData.traverses.find((s) => s.uuid === action.traverseUuid)?.refUuid,
      stmUuidRefsReadable: getStmNames({
        stmUuidRefs: action.stmUuidRefs,
        level1s: allData.level1s,
        level2s: allData.level2s,
        level3s: allData.level3s,
      }),
      iconEmojiDecoded: decodeEmoji(action.icon),
      equipmentItemsUsageReadable: makeEquipmentReadable({
        equipmentItems: action.equipmentItemsUsage,
        mission: allData.mission,
      }),
      geographicalUnitsReadable: action.geographicUnitsUsage?.map((geographicUnitUsageUuid) => {
        return allData.mission.geographicUnits.find((g) => g.uuid === geographicUnitUsageUuid)
          ?.name;
      }),
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
      gridCoordinates: missionGrid
        ? findGridCoordinatesFromPoint(missionGrid, action.location, allData.mission.planetRadius)
        : null,
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
  const exportPois: ExportPOI[] = pois.map((poi) => {
    const actionsReadable: ExportAction[] = makeExportActions({
      actions: allData.actions.filter((a) => poi.actionOrderUuids?.includes(a.uuid)),
      allData,
      missionGrid,
    });
    const poiCalculatedFields = getCalculatedFieldsByPoi({
      poiUuid: poi.uuid,
      actions: allData.actions,
    });
    const exportPoi: ExportPOI = {
      ...poi,
      _itemType: "POI",
      actionsReadable,
      descriptionReadable: decodeWsywig(poi.description),
      calculatedFields: poiCalculatedFields,
      elevationRelative: poi.elevation - allData.mission.landerElevationMeters,
      iconEmojiDecoded: decodeEmoji(poi.icon),
      gridCoordinates: missionGrid
        ? findGridCoordinatesFromPoint(missionGrid, poi.location, allData.mission.planetRadius)
        : null,
    };
    return exportPoi;
  });
  return exportPois;
};

export const makeExportStations = (params: {
  stations: Station[];
  missionGrid: MissionGridPoint[][];
  allData: AllDataForExport;
}): ExportStation[] => {
  const { stations, allData, missionGrid } = params;
  const exportStations: ExportStation[] = stations.map((station) => {
    const actionsReadable: ExportAction[] = makeExportActions({
      actions: allData.actions.filter((a) => station.actionOrderUuids?.includes(a.uuid)),
      allData,
      missionGrid,
    });
    const stationCalculatedFields = getCalculatedFieldsByStation({
      stationUuid: station.uuid,
      stations: allData.stations,
      mission: allData.mission,
      actions: allData.actions,
    });
    const ExportStation: ExportStation = {
      ...station,
      _itemType: "Station",
      descriptionReadable: decodeWsywig(station.description),
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
            description: decodeWsywig(poi.description),
          };
        }
      }),
      gridCoordinates: missionGrid
        ? findGridCoordinatesFromPoint(missionGrid, station.location, allData.mission.planetRadius)
        : null,
      actionOrderRefUuids: station.actionOrderUuids?.map(
        (actionOrderUuid) => allData.actions.find((a) => a.uuid === actionOrderUuid)?.refUuid
      ),
    };
    return ExportStation;
  });
  return exportStations;
};

export const makeExportTraverses = (params: {
  traverses: Traverse[];
  missionGrid: MissionGridPoint[][];
  allData: AllDataForExport;
}): ExportTraverse[] => {
  const { traverses, allData, missionGrid } = params;
  const exportTraverses: ExportTraverse[] = traverses.map((traverse) => {
    const traverseCalculatedFields = getCalculatedFieldsByTraverse({
      traverseUuid: traverse.uuid,
      traverses: allData.traverses,
      mission: allData.mission,
      evas: allData.evas,
      actions: allData.actions,
    });
    const actionsReadable: ExportAction[] = makeExportActions({
      actions: allData.actions.filter((a) => traverse.actionOrderUuids?.includes(a.uuid)),
      allData,
      missionGrid,
    });
    return {
      ...traverse,
      _itemType: "Traverse",
      descriptionReadable: decodeWsywig(traverse.description),
      calculatedFields: traverseCalculatedFields,
      actionsReadable: actionsReadable,
      actionOrderRefUuids: traverse.actionOrderUuids?.map(
        (actionOrderUuid) => allData.actions.find((a) => a.uuid === actionOrderUuid)?.refUuid
      ),
    };
  });
  return exportTraverses;
};

export const makeExportEvas = (params: {
  evas: Eva[];
  missionGrid: MissionGridPoint[][];
  allData: AllDataForExport;
}): ExportEva[] => {
  const { evas, allData, missionGrid } = params;
  const exportEvas: ExportEva[] = evas.map((eva) => {
    const evaCalculatedFields = getCalculatedFieldsByEva({
      evaUuid: eva.uuid,
      evas: allData.evas,
      stations: allData.stations,
      mission: allData.mission,
      actions: allData.actions,
      traverses: allData.traverses,
    });
    const exportEva: ExportEva = {
      ...eva,
      _itemType: "EVA",
      descriptionReadable: decodeWsywig(eva.description),
      sequenceReadable: eva.sequence.map((sequenceItem) => {
        if (sequenceItem.type === "station") {
          return makeExportStations({
            stations: allData.stations.filter((s) => s.uuid === sequenceItem.uuid),
            allData,
            missionGrid,
          })[0];
        } else if (sequenceItem.type === "traverse") {
          return makeExportTraverses({
            traverses: allData.traverses.filter((t) => t.uuid === sequenceItem.uuid),
            allData,
            missionGrid,
          })[0];
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
    };
    return exportEva;
  });

  return exportEvas;
};

export const makeExportRexes = (params: { rexes: Rex[] }): ExportRex[] => {
  const { rexes } = params;
  const exportRexes: ExportRex[] = rexes.map((rex) => {
    const exportRex: ExportRex = {
      ...rex,
      _itemType: "Rex",
      descriptionReadable: decodeWsywig(rex.description),
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
  const exportMission: ExportMission = {
    ...mission,
    gridCoordinates: missionGrid
      ? findGridCoordinatesFromPoint(missionGrid, mission?.landerLocation, mission.planetRadius)
      : null,
  };

  return exportMission;
};

export const makeReadableActionDefinition = (params: {
  action: Action;
  actionDefinitions: ActionDefinitions;
}): ActionDefinitionReadable => {
  const { action, actionDefinitions } = params;
  if (!action.actionDefinition) return null;

  const verb = actionDefinitions.verbs.find(
    (verb) => verb.uuid === action.actionDefinition.verbUuid
  );
  const noun = actionDefinitions.nouns.find(
    (noun) => noun.uuid === action.actionDefinition.nounUuid
  );
  const adjective = actionDefinitions.adjectives.find(
    (adjective) => adjective.uuid === action.actionDefinition.adjectiveUuid
  );

  const readableActionDefinition: ActionDefinitionReadable = {
    displayString: `${verb?.name} of ${noun?.name} in ${adjective?.name}`,
    verb: verb,
    noun: noun,
    adjective: adjective,
  };
  return readableActionDefinition;
};
