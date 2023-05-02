import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Mission } from "./mission.model";
import { User } from "./user.model";
import { types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Eva implements Eva_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => User, { unique: false, primary: false })
  owner!: User;
  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.string })
  status!: StationStatus;
  @Property({ type: MikroTypes.json, nullable: true })
  sequence!: EvaSequenceItem[];
  @Property({ type: MikroTypes.text, nullable: true })
  description!: string;
  @Property({ type: MikroTypes.double, nullable: true })
  maxDuration!: number;
  @Property({ type: MikroTypes.double, nullable: true })
  traverseRate!: number;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
