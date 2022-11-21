import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from "@mikro-orm/core";
import { Mission } from "./mission.model";
import { STMGoal } from "./stmGoal.model";

@Entity()
export class STMObjective {
  @PrimaryKey({ type: "string" })
  uuid!: string;

  @ManyToOne(() => Mission) //many objectives have one mission
  mission!: Mission;
  @OneToMany(() => STMGoal, (i) => i.objective) //one objective has many goals
  goals = new Collection<STMGoal>(this);

  @Property({ type: "string" })
  name!: string;
  @Property({ type: "string" })
  numbering!: string;

  @Property({ type: "date" })
  createdAt!: Date;
  @Property({ type: "date" })
  updatedAt!: Date;
}
