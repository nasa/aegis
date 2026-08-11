import { defineEntity, p } from "@mikro-orm/postgresql";

import { Layer_db as LayerEntity } from "./layer.model";

export const Sublayer_dbSchema = defineEntity({
  name: "Sublayer_db",
  properties: {
    uuid: p.uuid().primary(),
    missionId: p.integer(),
    layer: () => p.manyToOne(LayerEntity).updateRule("cascade"),
    name: p.text().nullable(),
    description: p.text().nullable(),
    legend: p.json<Legend>().nullable(),
    type: p.text().$type<SublayerType>().nullable(),
    path: p.text().nullable(),
    tilePattern: p.text().nullable(),
    boundingBox: p.json<number[]>().nullable(),
    tileFormat: p.text().nullable(),
    minNativeZoom: p.float().nullable(),
    maxNativeZoom: p.float().nullable(),
    maxZoom: p.float().nullable(),
    isTimeBased: p.boolean().nullable(),
    timeLayerManifest: p.json<TimeLayerInfo[]>().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Sublayer_db extends Sublayer_dbSchema.class implements Sublayer_db_type {}

Sublayer_dbSchema.setClass(Sublayer_db);
