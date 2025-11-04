interface ExportMission extends Mission {
  gridCoordinates: string;
}

interface ExportAction extends Action {
  _itemType: string;
  descriptionReadable: string;
  parentPoiName: string;
  parentStationName: string;
  parentTraverseName: string;
  stationRefUuid: string;
  traverseRefUuid: string;
  iconEmojiDecoded: string;
  equipmentItemsUsageReadable: EquipmentItemUsageReadable[] | null;
  geographicalUnitsReadable: string[] | null;
  actionDefinitionReadable: ActionDefinitionReadable | null;
  stmPrioritiesReadable: StmPriorityReadable[] | null;
  gridCoordinates: string;
  rexUuid: string | null; // the rex uuid if this action is in an EVA that is in a rex
}

interface ActionDefinitionReadable {
  displayString: string;
  verb: ActionDefinitionItem;
  noun: ActionDefinitionItem;
  adjective: ActionDefinitionItem;
}

interface StmPriorityReadable {
  uuid: string;
  priority: number;
}

interface ExportPOI extends POI {
  _itemType: string;
  descriptionReadable: string;
  actionsReadable: ExportAction[];
  calculatedFields: PoiCalculatedFields;
  elevationRelative: number;
  iconEmojiDecoded: string;
  gridCoordinates: string;
}

type PoiSummaryReadable = {
  name: string;
  description: string;
};

interface ExportStation extends Station {
  _itemType: string;
  descriptionReadable: string;
  actionsReadable: ExportAction[];
  calculatedFields: ExportStationCalculatedFields;
  elevationRelative: number;
  iconEmojiDecoded: string;
  poisAssociatedReadable: PoiSummaryReadable[];
  gridCoordinates: string;
  actionOrderRefUuids: string[];
  rexUuid: string | null; // the rex uuid if this station is in an EVA that is in a rex
}

interface ExportStationCalculatedFields extends StationCalculatedFields {
  equipmentItemsReadable: EquipmentItemUsageReadable[];
}

interface ExportTraverse extends Traverse {
  _itemType: string;
  descriptionReadable: string;
  calculatedFields: TraverseCalculatedFields;
  actionsReadable: ExportAction[];
  actionOrderRefUuids: string[];
  rexUuid: string | null; // the rex uuid if this traverse is in an EVA that is in a rex
}

interface EvaSequenceItemRefUuid extends EvaSequenceItem {
  refUuid: string;
}
interface ExportEva extends Eva {
  _itemType: string;
  descriptionReadable: string;
  sequenceReadable: (ExportStation | ExportTraverse)[]; // stations and traverses in order
  sequenceRefUuids: EvaSequenceItemRefUuid[];
  egressLocationRefUuid: string; // station refUuid or "lander"
  ingressLocationRefUuid: string; // station refUuid or "lander"
  calculatedFields: ExportEvaCalculatedFields;
  rexUuid: string | null; // the rex uuid if this eva is in a rex
}

interface ExportEvaCalculatedFields extends EvaCalculatedFields {
  equipmentItemsReadable: EquipmentItemUsageReadable[];
}

interface ExportRex extends Rex {
  _itemType: string;
  descriptionReadable: string;
}

type EquipmentItemUsageReadable = {
  name: string;
  singleUse: boolean;
  quantityUsed: number;
};

type AllDataForExport = {
  mission: Mission;
  actions: Action[];
  pois: POI[];
  stations: Station[];
  evas: Eva[];
  traverses: Traverse[];
  rexes: Rex[];
  level1s: STMLevel1[];
  level2s: STMLevel2[];
  level3s: STMLevel3[];
};
