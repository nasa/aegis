interface ExportMission extends Mission {
  gridCoordinates: string;
}

interface ExportAction extends Action {
  _itemType: string;
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
  verb: { uuid: string; name: string; abbr: string };
  noun: { uuid: string; name: string; abbr: string };
  adjective: { uuid: string; name: string; abbr: string };
}

interface StmPriorityReadable {
  uuid: string;
  priority: number;
}

interface ExportPOI extends POI {
  _itemType: string;
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
}

type EquipmentItemUsageReadable = {
  name: string;
  singleUse: boolean;
  quantityUsed: number;
};

type MissionDump = {
  exportDate: string;
  missionData: MissionSourceData;
};

type MissionSourceData = {
  mission: Mission;
  layers: Layer_db[];
  sublayers: Sublayer_db[];
  presets: Preset_db[];
  stmLevel1s?: STM_Level1_db[];
  stmLevel2s?: STM_Level2_db[];
  stmLevel3s?: STM_Level3_db[];
  stmRules?: STM_Rule_db[];
  folders: Folder_db[];
};
