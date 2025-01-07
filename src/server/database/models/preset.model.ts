import { Entity, ManyToOne, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";
import { Mission_db } from "./_allModels";

@Entity()
export class Preset_db implements Preset_db_type {
  @PrimaryKey({ type: MikroTypes.uuid, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;

  @Property({ type: MikroTypes.text })
  name: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description: string;
  @Property({ type: MikroTypes.boolean, default: false })
  missionPreset: boolean;
  @Property({ type: MikroTypes.boolean, default: false })
  missionPresetDefault: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  mapSublayerControls!: MapSublayerControls;
  @Property({ type: MikroTypes.json, nullable: true })
  mapCircleControls!: MapCircleControls;
  @Property({ type: MikroTypes.json, nullable: true })
  layerOrder: PresetLayerOrder[];
  @Property({ type: MikroTypes.double, nullable: true })
  sunAzimuth: number;
  @Property({ type: MikroTypes.boolean, nullable: true, default: true })
  sunEnabled: boolean;
  @Property({ type: MikroTypes.double, nullable: true })
  earthAzimuth: number;
  @Property({ type: MikroTypes.boolean, nullable: true, default: true })
  earthEnabled: boolean;
  @Property({ type: MikroTypes.boolean, nullable: true, default: false })
  earthAsMoon: boolean;
  @Property({ type: MikroTypes.integer, nullable: true })
  ownerId: number;

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
