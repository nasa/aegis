import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Mission {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.json, nullable: true })
  config!: Config;
  @Property({ type: MikroTypes.integer })
  version!: number;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
