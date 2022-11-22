import { Entity, PrimaryKey, Property, ManyToOne, types as MikroTypes } from "@mikro-orm/core";
import { STM_Goal } from "./stm_goal.model";

@Entity()
export class STM_Investigation {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => STM_Goal) //many investigations have one goal
  goal!: STM_Goal;

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
