import {
  BeforeCreate,
  BeforeUpdate,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { v4 } from "uuid";
import { Layer } from "./layer.model";

@Entity()
export class Preset implements AEGISPreset {
  @PrimaryKey({ type: "string" })
  uuid: string = v4();

  @ManyToOne(() => Layer, { unique: false, primary: false })
  layer: Layer;
  @Property({ type: "json", nullable: true })
  config!: AEGISPresetValue;

  @Property({ type: "date" })
  createdAt!: Date;

  @Property({ type: "date" })
  updatedAt!: Date;

  constructor(config: AEGISPresetValue) {
    this.config = config;
  }

  @BeforeUpdate()
  async beforeUpdate(uuid: string): Promise<void> {
    this.uuid = uuid;
    this.updatedAt = new Date();
  }

  @BeforeCreate()
  async beforeCreate(): Promise<void> {
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}
