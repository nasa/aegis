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
  missionPriorityReadable: MissionPriorityReadable | null;
  stmPrioritiesReadable: StmPriorityReadable[] | null;
  gridCoordinates: string;
  rexUuid: string | null; // the rex uuid if this action is in an EVA that is in a rex
}

interface MissionPriorityReadable {
  uuid: string;
  trace: string;
  category: string;
  displayString: string; // "<trace> | <category>"
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
  /** Null until the walkback terrain profile is available. */
  walkbackPathSegmentElevations: number[][] | null; //meters
  elevationRelative: number;
  iconEmojiDecoded: string;
  poisAssociatedReadable: PoiSummaryReadable[];
  gridCoordinates: string;
  actionOrderRefUuids: string[];
  rexUuid: string | null; // the rex uuid if this station is in an EVA that is in a rex
}

interface ExportStationCalculatedFields extends Omit<
  StationCalculatedFields,
  "walkbackAscentDescentAvailable"
> {
  equipmentItemsReadable: EquipmentItemUsageReadable[];
}

interface ExportTraverse extends Traverse {
  _itemType: string;
  /** Null until the traverse terrain profile is available. */
  pathSegmentElevations: number[][] | null; //meters
  pathSegmentAbsoluteSlopes: (number | null)[][] | null; //degrees
  calculatedFields: ExportTraverseCalculatedFields;
  actionsReadable: ExportAction[];
  actionOrderRefUuids: string[];
  rexUuid: string | null; // the rex uuid if this traverse is in an EVA that is in a rex
}

interface ExportTraverseCalculatedFields extends Omit<
  TraverseCalculatedFields,
  "ascentDescentAvailable"
> {
  // Alias of movementDurationMinutes, exposed for Maestro consumers
  durationMinutes: number;
}

interface EvaSequenceItemRefUuid extends EvaSequenceItem {
  refUuid: string;
}
interface ExportEva extends Eva {
  _itemType: string;
  sequenceReadable: (ExportStation | ExportTraverse)[]; // stations and traverses in order
  sequenceRefUuids: EvaSequenceItemRefUuid[];
  calculatedFields: ExportEvaCalculatedFields;
  rexUuid: string | null; // the rex uuid if this eva is in a rex
}

interface ExportEvaCalculatedFields extends Omit<
  EvaCalculatedFields,
  "totalTraverseAscentDescentAvailable"
> {
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
};
