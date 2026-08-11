import { defineEntity, p } from "@mikro-orm/postgresql";

import { Poi_db as PoiEntity } from "./poi.model";
import { Station_db as StationEntity } from "./station.model";
import { Traverse_db as TraverseEntity } from "./traverse.model";

export const Action_dbSchema = defineEntity({
  name: "Action_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    poi: () => p.manyToOne(PoiEntity),
    station: () => p.manyToOne(StationEntity),
    traverse: () => p.manyToOne(TraverseEntity),
    parentAction: () => p.manyToOne(Action_db),
    parentCopyDate: p.double().$type<number>().nullable(),
    name: p.text(),
    priority: p.integer().nullable(),
    stmPriorities: p.json<StmPriorities>().nullable(),
    type: p.string().$type<ActionType>(),
    stmAction: p.boolean().default(false),
    actionDefinition: p.json<ActionDefinition>().nullable(),
    description: p.text(),
    descriptionTask: p.text().nullable(),
    icon: p.string().nullable(),
    location: p.json<AEGISPoint>().nullable(),
    elevation: p.float().nullable(),
    duration: p.float().nullable(),
    equipmentItemsUsage: p.json<EquipmentItemUsages>().nullable(),
    geographicUnitsUsage: p.json<string[]>().nullable(),
    mass: p.float().nullable(),
    status: p.string().$type<POIStatus>(),
    enabled: p.boolean().default(true),
    crewAssigned: p.json<Crew[]>().nullable(),
    createdAt: p.double().$type<number>(),
    updatedAt: p.double().$type<number>(),
    version: p.integer().version(),
  },
});

export class Action_db extends Action_dbSchema.class implements Action_db_type {}

Action_dbSchema.setClass(Action_db);
