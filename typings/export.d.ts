interface ExportAction extends Action {
  _itemType: string;
  descriptionReadable: string;
  parentPoiName: string;
  parentStationName: string;
  stmNames: string[];
  iconEmojiDecoded: string;
  equipmentItemsUsageReadable: EquipmentItemUsageReadable[];
  geographicalUnitsReadable: string[];
}

interface ExportPOI extends POI {
  _itemType: string;
  descriptionReadable: string;
  actionsReadable: Action[];
  calculatedFields: PoiCalculatedFields;
  elevationRelative: number;
  iconEmojiDecoded: string;
}

type PoiSummaryReadable = {
  name: string;
  description: string;
};

interface ExportStation extends Station {
  _itemType: string;
  descriptionReadable: string;
  actionsReadable: Action[];
  calculatedFields: StationCalculatedFields;
  elevationRelative: number;
  iconEmojiDecoded: string;
  poisAssociatedReadable: PoiSummaryReadable[];
}

interface ExportStationCalculatedFields extends StationCalculatedFields {
  equipmentItemsReadable: EquipmentItemUsageReadable[];
}

interface ExportTraverse extends Traverse {
  _itemType: string;
  descriptionReadable: string;
  calculatedFields: TraverseCalculatedFields;
}

interface ExportEva extends Eva {
  _itemType: string;
  descriptionReadable: string;
  sequenceReadable: (Station | Traverse)[]; // stations and traverses in order
  calculatedFields: ExportEvaCalculatedFields;
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

type ExportedData = {
  mission: Mission;
  pois: ExportPOI[];
  stations: ExportStation[];
  actions: ExportAction[];
  traverses: ExportTraverses[];
  evas: ExportEva[];
  rexes: ExportRex[];
};
