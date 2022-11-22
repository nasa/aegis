import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  types as MikroTypes,
} from "@mikro-orm/core";
import { Mission } from "./mission.model";
import { STM_Goal } from "./stm_goal.model";

@Entity()
export class STM_Objective {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => Mission) //many objectives have one mission
  mission!: Mission;
  @OneToMany(() => STM_Goal, (i) => i.objective) //one objective has many goals
  goals = new Collection<STM_Goal>(this);

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
