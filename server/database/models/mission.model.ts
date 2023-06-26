import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Mission implements Mission_db_type {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description!: string;
  @Property({ type: MikroTypes.json, nullable: true })
  config!: Config;
  @Property({ type: MikroTypes.integer })
  version!: number;
  @Property({ type: MikroTypes.json, nullable: true })
  landerLocation: AEGISPoint;
  @Property({ type: MikroTypes.double, nullable: true })
  traverseSpeed: number;
  @Property({ type: MikroTypes.double, nullable: true })
  landerElevationMeters: number;
  @Property({ type: MikroTypes.double, nullable: true })
  sunAzimuth: number;
  @Property({ type: MikroTypes.double, nullable: true })
  earthAzimuth: number;
  @Property({ type: MikroTypes.boolean, default: false })
  sunAzimuthVisible: boolean;
  @Property({ type: MikroTypes.boolean, default: false })
  earthAzimuthVisible: boolean;
  @Property({ type: MikroTypes.double, nullable: true })
  defaultEvaDuration: number;
  @Property({ type: MikroTypes.double, nullable: true, default: 2 })
  walkbackSpeed: number;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
