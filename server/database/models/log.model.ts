import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";

import { types as MikroTypes } from "@mikro-orm/core";
import { Mission_db } from "./_allModels";

@Entity()
export class Log_db implements Log_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;
  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;

  @Property({ type: MikroTypes.string })
  type: LogType;
  @Property({ type: MikroTypes.json })
  payloadJson: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
}
