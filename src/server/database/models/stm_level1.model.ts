import {
  Entity,
  PrimaryKey,
  Property,
  OneToMany,
  Collection,
  types as MikroTypes,
} from "@mikro-orm/postgresql";

import { STM_Level2_db } from "./_allModels";

@Entity()
export class STM_Level1_db implements STMLevel1_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @Property({ type: MikroTypes.integer })
  missionId!: number;
  @OneToMany(() => STM_Level2_db, (i) => i.level1) //one level1 has many level2s
  level2s = new Collection<STM_Level2_db>(this);

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
