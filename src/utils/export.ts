import { stripHtml } from "string-strip-html";
import { convertNodeToHTML, convertStringToNodes } from "components/interface/form/wysiwyg";
import _ from "lodash";
import { decodeEmoji } from "./formatting";

const decodeWsywig = (string: string): string => {
  if (!string) return string;

  // convert wysiwyg to html and strip the html tags
  let newString = stripHtml(
    _.reduce(
      convertStringToNodes(string),
      (htmlString, decendant) => htmlString + convertNodeToHTML(decendant),
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
  stations: Station[];
  pois: POI[];
  stmStore: STMState;
  mission: Mission;
}): ExportAction[] => {
  const { actions, mission, stations, pois, stmStore } = params;
  const exportActions: ExportAction[] = actions.map((action) => {
    const exportAction: ExportAction = {
      ...action,
      _itemType: "Action",
      descriptionReadable: decodeWsywig(action.description),
      parentStationName: stations.find((s) => s.uuid === action.stationUuid)?.name,
      parentPoiName: pois.find((p) => p.uuid === action.poiUuid)?.name,
      stmNames: getStmNames({
        stmUuidRefs: action.stmUuidRefs,
        level1s: stmStore.level1s,
        level2s: stmStore.level2s,
        level3s: stmStore.level3s,
      }),
      iconEmojiDecoded: decodeEmoji(action.icon),
      equipmentItemsUsageReadable: makeEquipmentReadable({
        equipmentItems: action.equipmentItemsUsage,
        mission,
      }),
      geographicalUnitsReadable: action.geographicUnitsUsage?.map((geographicUnitUsageUuid) => {
        return mission.geographicUnits.find((g) => g.uuid === geographicUnitUsageUuid)?.name;
      }),
    };
    return exportAction;
  });

  return exportActions;
};

export const makeExportPois = (params: {
  poiStore: PoiState;
  actions: ExportAction[];
  missionStore: MissionState;
}): ExportPOI[] => {
  const { poiStore, actions, missionStore } = params;
  const exportPois: ExportPOI[] = poiStore.pois.map((poi) => {
    const actionsReadable: ExportAction[] = [];
    poi.actionOrderUuids.forEach((actionUuid) => {
      const action = actions.find((a) => a.uuid === actionUuid);
      if (action) actionsReadable.push(action);
    });
    const exportPoi: ExportPOI = {
      ...poi,
      _itemType: "POI",
      actionsReadable,
      descriptionReadable: decodeWsywig(poi.description),
      calculatedFields: poiStore.calculatedFields.find((c) => c.uuid === poi.uuid),
      elevationRelative: poi.elevation - missionStore.mission.landerElevationMeters,
      iconEmojiDecoded: decodeEmoji(poi.icon),
    };
    return exportPoi;
  });
  return exportPois;
};

export const makeExportStations = (params: {
  stationStore: StationState;
  actions: ExportAction[];
  missionStore: MissionState;
  pois: POI[];
}): ExportStation[] => {
  const { stationStore, actions, missionStore, pois } = params;
  const exportStations: ExportStation[] = stationStore.stations.map((station) => {
    const actionsReadable: ExportAction[] = [];
    station.actionOrderUuids.forEach((actionUuid: string) => {
      const action = actions.find((a) => a.uuid === actionUuid);
      if (action) actionsReadable.push(action);
    });
    const ExportStation: ExportStation = {
      ...station,
      _itemType: "Station",
      descriptionReadable: decodeWsywig(station.description),
      actionsReadable,
      calculatedFields: {
        ...stationStore.calculatedFields.find((c) => c.uuid === station.uuid),
        equipmentItemsReadable: makeEquipmentReadable({
          equipmentItems: stationStore.calculatedFields.find((c) => c.uuid === station.uuid)
            ?.equipmentItems,
          mission: missionStore.mission,
        }),
      } as ExportStationCalculatedFields,
      elevationRelative: station.elevation - missionStore.mission.landerElevationMeters,
      iconEmojiDecoded: decodeEmoji(station.icon),
      poisAssociatedReadable: station.poiUuids?.map((poiUuid) => {
        const poi = pois.find((p) => p.uuid === poiUuid);
        if (poi) {
          return {
            name: poi.name,
            description: decodeWsywig(poi.description),
          };
        }
      }),
    };
    return ExportStation;
  });
  return exportStations;
};

export const makeExportTraverses = (params: {
  traverses: Traverse[];
  calculatedFields: TraverseCalculatedFields[];
}): ExportTraverse[] => {
  const { traverses, calculatedFields } = params;
  const exportTraverses: ExportTraverse[] = traverses.map((traverse) => {
    return {
      ...traverse,
      _itemType: "Traverse",
      descriptionReadable: decodeWsywig(traverse.description),
      calculatedFields: calculatedFields.find((c) => c.uuid === traverse.uuid),
    };
  });
  return exportTraverses;
};

export const makeExportEvas = (params: {
  evas: Eva[];
  evaCalculatedFields: EvaCalculatedFields[];
  stations: ExportStation[];
  traverses: ExportTraverse[];
  missionStore: MissionState;
}): ExportEva[] => {
  const { evas, evaCalculatedFields, stations, traverses, missionStore } = params;
  const exportEvas: ExportEva[] = evas.map((eva) => {
    const exportEva: ExportEva = {
      ...eva,
      _itemType: "EVA",
      descriptionReadable: decodeWsywig(eva.description),
      sequenceReadable: eva.sequence.map((sequenceItem) => {
        if (sequenceItem.type === "station") {
          return stations.find((s) => s.uuid === sequenceItem.uuid);
        } else if (sequenceItem.type === "traverse") {
          return traverses.find((t) => t.uuid === sequenceItem.uuid);
        }
      }),
      calculatedFields: {
        ...evaCalculatedFields.find((c) => c.uuid === eva.uuid),
        equipmentItemsReadable: makeEquipmentReadable({
          equipmentItems: evaCalculatedFields.find((c) => c.uuid === eva.uuid)?.equipmentItems,
          mission: missionStore.mission,
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
