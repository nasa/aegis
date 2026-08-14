import { defineEntity, p } from "@mikro-orm/postgresql";

export const Layer_dbSchema = defineEntity({
  name: "Layer_db",
  properties: {
    uuid: p.uuid().primary(),
    missionId: p.integer(),
    name: p.text().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Layer_db extends Layer_dbSchema.class implements Layer_db_type {}

Layer_dbSchema.setClass(Layer_db);
