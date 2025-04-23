import { Entity, ManyToOne, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";
import { Layer_db, Mission_db } from "./_allModels";

@Entity()
export class Sublayer_db implements Sublayer_db_type {
  @PrimaryKey({ type: MikroTypes.uuid })
  uuid: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;
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
  @Property({ type: MikroTypes.double, nullable: true })
  minNativeZoom: number;
  @Property({ type: MikroTypes.double, nullable: true })
  maxNativeZoom: number;
  @Property({ type: MikroTypes.double, nullable: true })
  maxZoom: number;
  @Property({ type: MikroTypes.json, nullable: true })
  style: MapSublayerStyle;
  @Property({ type: MikroTypes.boolean, nullable: true })
  isTimeBased: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  timeLayerManifest: TimeLayerInfo[];

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
