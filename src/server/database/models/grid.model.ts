import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/postgresql";
import { types as MikroTypes } from "@mikro-orm/postgresql";

import { Mission_db } from "./_allModels";

@Entity()
export class Grid_db implements Grid_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false, nullable: true })
  mission!: Mission_db;

  @Property({ type: MikroTypes.integer, nullable: true })
  numRows!: number;
  @Property({ type: MikroTypes.integer, nullable: true })
  numCols!: number;
  @Property({ type: MikroTypes.integer, nullable: true })
  spacing!: number;
  @Property({ type: MikroTypes.text, nullable: true })
  name!: string;
  @Property({ type: MikroTypes.boolean, nullable: true })
  isActiveGrid!: boolean;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number; //used for optimistic locking
}
