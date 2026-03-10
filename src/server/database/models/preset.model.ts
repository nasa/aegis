import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/postgresql";

@Entity()
export class Preset_db implements Preset_db_type {
  @PrimaryKey({ type: MikroTypes.uuid, unique: true })
  uuid!: string;

  @Property({ type: MikroTypes.integer })
  missionId!: number;

  @Property({ type: MikroTypes.text })
  name: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description: string;
  @Property({ type: MikroTypes.boolean, default: false })
  missionDefault: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  mapSublayerControls!: MapSublayerControls;
  @Property({ type: MikroTypes.json, nullable: true })
  mapCircleControls!: MapCircleControls;
  @Property({ type: MikroTypes.json, nullable: true })
  mapGridControl!: MapGridControl;
  @Property({ type: MikroTypes.json, nullable: true })
  layerOrder: PresetLayerOrder[];
  @Property({ type: MikroTypes.float, nullable: true })
  sunAzimuth: number;
  @Property({ type: MikroTypes.boolean, nullable: true, default: true })
  sunEnabled: boolean;
  @Property({ type: MikroTypes.float, nullable: true })
  earthAzimuth: number;
  @Property({ type: MikroTypes.boolean, nullable: true, default: true })
  earthEnabled: boolean;
  @Property({ type: MikroTypes.boolean, nullable: true, default: false })
  earthAsMoon: boolean;
  @Property({ type: MikroTypes.integer, nullable: true })
  ownerId: number;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
