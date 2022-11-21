import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import { STMGoal } from "./stmGoal.model";

@Entity()
export class STMInvestigation {
  @PrimaryKey({ type: "string" })
  uuid!: string;

  @ManyToOne(() => STMGoal) //many investigations have one goal
  goal!: STMGoal;

  @Property({ type: "string" })
  name!: string;
  @Property({ type: "string" })
  numbering!: string;

  @Property({ type: "date" })
  createdAt!: Date;
  @Property({ type: "date" })
  updatedAt!: Date;
}
