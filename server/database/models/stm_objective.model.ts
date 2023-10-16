import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  types as MikroTypes,
} from "@mikro-orm/core";
import { Mission_db, STM_Goal_db } from "./_allModels";

@Entity()
export class STM_Objective_db implements STMObjective_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => Mission_db) //many objectives have one mission
  mission!: Mission_db;
  @OneToMany(() => STM_Goal_db, (i) => i.objective) //one objective has many goals
  goals = new Collection<STM_Goal_db>(this);

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
