import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  types as MikroTypes,
} from "@mikro-orm/postgresql";

import { STM_Level2_db } from "./_allModels";

@Entity()
export class STM_Level3_db implements STMLevel3_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => STM_Level2_db) //many level3s have one level2
  level2!: STM_Level2_db;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
