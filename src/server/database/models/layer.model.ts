import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/postgresql";

@Entity()
export class Layer_db implements Layer_db_type {
  @PrimaryKey({ type: MikroTypes.uuid })
  uuid: string;

  @Property({ type: MikroTypes.integer })
  missionId!: number;

  @Property({ type: MikroTypes.text, nullable: true })
  name!: string;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
