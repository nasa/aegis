import { Entity, PrimaryKey, Property, ManyToOne, types as MikroTypes } from "@mikro-orm/core";
import { STM_Goal_db } from "./_allModels";

@Entity()
export class STM_Investigation_db implements STMInvestigation_db_type {
  @PrimaryKey({ type: MikroTypes.string })
  uuid!: string;

  @ManyToOne(() => STM_Goal_db) //many investigations have one goal
  goal!: STM_Goal_db;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  numbering!: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
