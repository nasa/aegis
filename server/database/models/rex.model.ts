import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";

import { types as MikroTypes } from "@mikro-orm/core";
import { Mission_db } from "./_allModels";

@Entity()
export class Rex_db implements Rex_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description!: string;
  @Property({ type: MikroTypes.string, nullable: true })
  petStartStopTimestamp: string;
  @Property({ type: MikroTypes.string, nullable: true })
  petValueAtStartStop: string;
  @Property({ type: MikroTypes.boolean, nullable: true })
  petRunning: boolean;
  @Property({ type: MikroTypes.string, nullable: true })
  selectedRexEvaUuid: string;
  @Property({ type: MikroTypes.boolean, nullable: true })
  rexRunning: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  crewPos: CrewPos[];

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
