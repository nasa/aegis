import { defineEntity, p } from "@mikro-orm/postgresql";

export const Preset_dbSchema = defineEntity({
  name: "Preset_db",
  properties: {
    uuid: p.uuid().unique().primary(),
    missionId: p.integer(),
    name: p.text(),
    description: p.text().nullable(),
    missionDefault: p.boolean().default(false),
    mapSublayerControls: p.json<MapSublayerControls>().nullable(),
    mapCircleControls: p.json<MapCircleControls>().nullable(),
    mapGridControl: p.json<MapGridControl>().nullable(),
    layerOrder: p.json<PresetLayerOrder[]>().nullable(),
    sunAzimuth: p.float().nullable(),
    sunEnabled: p.boolean().nullable().default(true),
    earthAzimuth: p.float().nullable(),
    earthEnabled: p.boolean().nullable().default(true),
    earthAsMoon: p.boolean().nullable().default(false),
    ownerId: p.integer().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Preset_db extends Preset_dbSchema.class implements Preset_db_type {}

Preset_dbSchema.setClass(Preset_db);
