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
  @Property({ type: MikroTypes.string, nullable: false })
  evaUuid: string;
  @Property({ type: MikroTypes.boolean, nullable: true })
  isRunning: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  posEntries: PosEntry[];
  @Property({ type: MikroTypes.json, nullable: true })
  posTypes: PosType[];
  @Property({ type: MikroTypes.json, nullable: true })
  posSources: PosSource[];
  @Property({ type: MikroTypes.json, nullable: true })
  stationEntries: ActivityEntries;
  @Property({ type: MikroTypes.json, nullable: true })
  traverseEntries: ActivityEntries;
  @Property({ type: MikroTypes.json, nullable: true })
  actionEntries: ActionEntries;
  @Property({ type: MikroTypes.json, nullable: true })
  xgressEntries: XgressEntries;
  @Property({ type: MikroTypes.integer, nullable: true })
  ownerId: number;
  @Property({ type: MikroTypes.boolean, nullable: false, default: false })
  maestroControlled: boolean;
  @Property({ type: MikroTypes.string, nullable: true })
  maestroExecutionHash: string | null;
  @Property({ type: MikroTypes.json, nullable: true })
  maestroActivityPropertiesByRefUuid: MaestroActivityPropertiesByRefUuid | null;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
