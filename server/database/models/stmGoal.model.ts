import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from "@mikro-orm/core";
import { STMInvestigation } from "./stmInvestigation.model";
import { STMObjective } from "./stmObjective.model";

@Entity()
export class STMGoal {
  @PrimaryKey({ type: "string" })
  uuid!: string;

  @ManyToOne(() => STMObjective) //many goals have one objective
  objective!: STMObjective;
  @OneToMany(() => STMInvestigation, (i) => i.goal) //one goal has many investigations
  investigations = new Collection<STMInvestigation>(this);

  @Property({ type: "string" })
  name!: string;
  @Property({ type: "string" })
  numbering!: string;

  @Property({ type: "date" })
  createdAt!: Date;
  @Property({ type: "date" })
  updatedAt!: Date;
}
