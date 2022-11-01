import {
  BeforeCreate,
  BeforeUpdate,
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { v4 } from "uuid";
import { Mission } from "./mission.model";

@Entity()
export class Layer implements LayerModel {
  @PrimaryKey({ type: "string" })
  uuid: string = v4();

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission: Mission;
  @Property({ type: "json", nullable: true })
  config!: LayerConfig;
  @Property({ type: "date" })
  createdAt!: Date;

  @Property({ type: "date" })
  updatedAt!: Date;

  constructor(config: LayerConfig) {
    this.config = config;
  }

  @BeforeUpdate()
  async beforeUpdate(): Promise<void> {
    this.updatedAt = new Date();
  }

  @BeforeCreate()
  async beforeCreate(): Promise<void> {
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}
