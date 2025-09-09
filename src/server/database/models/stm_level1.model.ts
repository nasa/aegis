import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  types as MikroTypes,
} from "@mikro-orm/postgresql";

import { Mission_db, STM_Level2_db } from "./_allModels";

@Entity()
export class STM_Level1_db implements STMLevel1_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => Mission_db) //many level1s have one mission
  mission!: Mission_db;
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
}
