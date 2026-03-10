import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  types as MikroTypes,
} from "@mikro-orm/postgresql";

import { Layer_db } from "./_allModels";

@Entity()
export class Sublayer_db implements Sublayer_db_type {
  @PrimaryKey({ type: MikroTypes.uuid })
  uuid: string;

  @Property({ type: MikroTypes.integer })
  missionId!: number;
  @ManyToOne(() => Layer_db, { unique: false, primary: false })
  layer!: Layer_db;

  @Property({ type: MikroTypes.text, nullable: true })
  name!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description: string;
  @Property({ type: MikroTypes.json, nullable: true })
  legend: Legend;
  @Property({ type: MikroTypes.text, nullable: true })
  type: SublayerType;
  @Property({ type: MikroTypes.text, nullable: true })
  path: string;
  @Property({ type: MikroTypes.text, nullable: true })
  tilePattern: string;
  @Property({ type: MikroTypes.json, nullable: true })
  boundingBox: number[];
  @Property({ type: MikroTypes.text, nullable: true })
  tileFormat: string;
  @Property({ type: MikroTypes.float, nullable: true })
  minNativeZoom: number;
  @Property({ type: MikroTypes.float, nullable: true })
  maxNativeZoom: number;
  @Property({ type: MikroTypes.float, nullable: true })
  maxZoom: number;
  @Property({ type: MikroTypes.boolean, nullable: true })
  isTimeBased: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  timeLayerManifest: TimeLayerInfo[];

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
