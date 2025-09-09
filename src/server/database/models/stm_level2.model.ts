import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  types as MikroTypes,
} from "@mikro-orm/postgresql";

import { STM_Level3_db, STM_Level1_db } from "./_allModels";

@Entity()
export class STM_Level2_db implements STMLevel2_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => STM_Level1_db) //many level2s have one level1
  level1!: STM_Level1_db;
  @OneToMany(() => STM_Level3_db, (i) => i.level2) //one level2 has many level3s
  level3s = new Collection<STM_Level3_db>(this);

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;
}
