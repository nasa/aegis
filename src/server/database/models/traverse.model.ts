import { Entity, OneToMany, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { Collection } from "@mikro-orm/core";
import { types as MikroTypes } from "@mikro-orm/postgresql";

import { Action_db } from "./_allModels";

@Entity()
export class Traverse_db implements Traverse_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;
  @Property({
    type: MikroTypes.string,
    nullable: false,
    defaultRaw: "uuid_generate_v4()",
  })
  refUuid: string; // assigned on creation and is preserved when duplication for a rex

  @Property({ type: MikroTypes.integer })
  missionId!: number;
  @OneToMany(() => Action_db, (i: Action_db) => i.traverse) //one traverse has many actions
  action = new Collection<Action_db>(this);

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.json, nullable: true })
  path: AEGISPoint[];
  @Property({ type: MikroTypes.json, nullable: true })
  pathSegmentDistances: number[];
  @Property({ type: MikroTypes.json, nullable: true })
  pathSegmentElevations: number[][];
  @Property({ type: MikroTypes.float, nullable: true })
  duration: number;
  @Property({ type: MikroTypes.text })
  description: string;
  @Property({ type: MikroTypes.string, nullable: true })
  status: TraverseStatus;
  @Property({ type: MikroTypes.float, nullable: true, default: null })
  traverseRate: number;
  @Property({ type: MikroTypes.string, nullable: true })
  color: string;
  @Property({ type: MikroTypes.json, nullable: true })
  actionOrderUuids: string[];

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
