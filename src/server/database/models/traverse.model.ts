import { defineEntity, p } from "@mikro-orm/postgresql";

import { Action_db as ActionEntity } from "./action.model";

export const Traverse_dbSchema = defineEntity({
  name: "Traverse_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    action: () => p.oneToMany(ActionEntity).mappedBy("traverse"),
    name: p.text(),
    path: p.json<AEGISPoint[]>().nullable(),
    pathSegmentDistances: p.json<number[]>().nullable(),
    pathSegmentElevations: p.json<number[][]>().nullable(),
    duration: p.float().nullable(),
    description: p.text(),
    status: p.string().$type<TraverseStatus>().nullable(),
    traverseRate: p.float().nullable().default(null),
    color: p.string().nullable(),
    actionOrderUuids: p.json<string[]>().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Traverse_db extends Traverse_dbSchema.class implements Traverse_db_type {}

Traverse_dbSchema.setClass(Traverse_db);
