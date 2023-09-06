import { Entity, ManyToOne, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";
import { Mission } from "./mission.model";
import { Layer } from "./layer.model";

@Entity()
export class Sublayer implements Sublayer_db_type {
  @PrimaryKey({ type: MikroTypes.uuid })
  uuid: string;

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;
  @ManyToOne(() => Layer, { unique: false, primary: false })
  layer!: Layer;

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
