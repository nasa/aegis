import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  types as MikroTypes,
} from "@mikro-orm/core";
import { STM_Investigation_db, STM_Objective_db } from "./_allModels";

@Entity()
export class STM_Goal_db implements STMGoal_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => STM_Objective_db) //many goals have one objective
  objective!: STM_Objective_db;
  @OneToMany(() => STM_Investigation_db, (i) => i.goal) //one goal has many investigations
  investigations = new Collection<STM_Investigation_db>(this);

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
