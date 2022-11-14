import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

type MissionModel = {
  id: number;
  name: string;
  config: Config;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

@Entity()
export class Mission implements MissionModel {
  @PrimaryKey({ type: "number" })
  id!: number;

  @Property({ type: "string" })
  name!: string;
  @Property({ type: "json", nullable: true })
  config!: Config;
  @Property({ type: "number" })
  version!: number;
  @Property({ type: "date" })
  createdAt!: Date;

  @Property({ type: "date" })
  updatedAt!: Date;

  constructor(mission: string, config: Config, version: number) {
    this.name = mission;
    this.config = config;
    this.version = version;
  }
}
