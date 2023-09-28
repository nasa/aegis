import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";

import { types as MikroTypes } from "@mikro-orm/core";
import { Mission } from "./mission.model";

@Entity()
export class Log implements Log_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;
  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: MikroTypes.string })
  type: LogType;
  @Property({ type: MikroTypes.json })
  payloadJson: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
}
