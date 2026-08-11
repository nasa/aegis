import type { Poi_db, Station_db, Traverse_db } from "./_allModels";

export class Action_db implements Action_db_type {
  uuid!: string;

  refUuid: string; // assigned on creation and is preserved when duplication for a rex

  missionId!: number;
  //an action can belong to either a POI, station, or traverse

  poi: Poi_db;

  station: Station_db;

  traverse: Traverse_db;

  parentAction: Action_db;

  parentCopyDate: number;

  name!: string;

  priority: number;

  stmPriorities: StmPriorities;

  type!: ActionType;
  // Action v2 fields

  stmAction: boolean;

  actionDefinition: ActionDefinition;
  //

  description!: string;

  descriptionTask!: string;

  icon: string;

  location: AEGISPoint;

  elevation!: number;

  duration: number;

  equipmentItemsUsage: EquipmentItemUsages;

  geographicUnitsUsage: string[];

  mass: number;

  status!: POIStatus;

  enabled: boolean;

  crewAssigned: Crew[];

  createdAt: number;

  updatedAt: number;

  version!: number; //used for optimistic locking
}
