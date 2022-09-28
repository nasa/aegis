import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

@Entity()
export class Mission {
  @PrimaryKey({ type: "number" })
  id!: number;

  @Property({ type: "string" })
  mission!: string;
  @Property({ type: "json", nullable: true })
  config!: object;
  @Property({ type: "number" })
  version!: number;
  @Property({ type: "date" })
  createdAt!: Date;

  @Property({ type: "date" })
  updatedAt!: Date;

  constructor(mission: string, config: object, version: number) {
    this.mission = mission;
    this.config = config;
    this.version = version;
  }
}
