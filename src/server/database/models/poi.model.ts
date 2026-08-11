import { defineEntity, p } from "@mikro-orm/postgresql";

import { Station_db as StationEntity } from "./station.model";

export const Poi_dbSchema = defineEntity({
  name: "Poi_db",
  properties: {
    uuid: p.string().unique().primary(),
    missionId: p.integer(),
    station: () => p.manyToMany(StationEntity).mappedBy("poi"),
    name: p.text(),
    description: p.text(),
    priorityOverride: p.integer().nullable(),
    radius: p.float(),
    location: p.json<AEGISPoint>().nullable(),
    elevation: p.float().nullable(),
    icon: p.string().nullable(),
    tags: p.json<string[]>().nullable(),
    status: p.string().$type<POIStatus>(),
    actionOrderUuids: p.json<string[]>().nullable(),
    ownerId: p.integer().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Poi_db extends Poi_dbSchema.class implements Poi_db_type {}

Poi_dbSchema.setClass(Poi_db);
