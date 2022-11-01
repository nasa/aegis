import { Entity, ManyToOne, OneToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { v4 } from "uuid";
import { Preset } from "./preset.model";
import { Layer } from "./layer.model";

@Entity()
export class Preset_History implements AEGISPresetHistory {
  @PrimaryKey({ type: "string" })
  uuid: string = v4();
  @ManyToOne(() => Layer, { unique: false, primary: false })
  layer: Layer;
  @Property({ type: "json", nullable: true })
  config!: AEGISPresetValue;
  @OneToOne({ type: Preset })
  preset_id_fk!: Preset;
  @Property({ type: "date" })
  createdAt!: Date;

  @Property({ type: "date" })
  updatedAt!: Date;

  constructor(config: AEGISPresetValue) {
    this.config = config;
  }
}
