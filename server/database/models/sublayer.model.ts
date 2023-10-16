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
  url: string;
  @Property({ type: MikroTypes.text, nullable: true })
  type: "vector" | "tile" | "circle";
  @Property({ type: MikroTypes.text, nullable: true })
  filePath: string;
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
  @Property({ type: MikroTypes.text, nullable: true })
  color: string;
  @Property({ type: MikroTypes.double, nullable: true })
  opacity: number;
  @Property({ type: MikroTypes.text, nullable: true })
  fillColor: string;
  @Property({ type: MikroTypes.double, nullable: true })
  fillOpacity: number;
  @Property({ type: MikroTypes.double, nullable: true })
  weight: number;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
