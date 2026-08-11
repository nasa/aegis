import { defineEntity, p } from "@mikro-orm/postgresql";

import { Action_db as ActionEntity } from "./action.model";
import { Poi_db as PoiEntity } from "./poi.model";

export const Station_dbSchema = defineEntity({
  name: "Station_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    action: () => p.oneToMany(ActionEntity).mappedBy("station"),
    poi: () => p.manyToMany(PoiEntity).inversedBy("station").owner(),
    name: p.text(),
    status: p.string().$type<StationStatus>(),
    description: p.text(),
    radius: p.float(),
    location: p.json<AEGISPoint>().nullable(),
    elevation: p.float().nullable(),
    walkbackPath: p.json<AEGISPoint[]>().nullable(),
    walkbackPathSegmentDistances: p.json<number[]>().nullable(),
    walkbackPathSegmentElevations: p.json<number[][]>().nullable(),
    walkbackTraverseRate: p.float().nullable(),
    actionOrderUuids: p.json<string[]>().nullable(),
    duration: p.float().nullable(),
    icon: p.string().nullable(),
    ownerId: p.integer().nullable(),
    mapCircleControls: p.json<MapCircleControls>().default("{}"),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Station_db extends Station_dbSchema.class implements Station_db_type {}

Station_dbSchema.setClass(Station_db);
