import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  types as MikroTypes,
} from "@mikro-orm/core";
import { STM_Investigation } from "./stm_investigation.model";
import { STM_Objective } from "./stm_objective.model";

@Entity()
export class STM_Goal implements STMGoal_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => STM_Objective) //many goals have one objective
  objective!: STM_Objective;
  @OneToMany(() => STM_Investigation, (i) => i.goal) //one goal has many investigations
  investigations = new Collection<STM_Investigation>(this);

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
