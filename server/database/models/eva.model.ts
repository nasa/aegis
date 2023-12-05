import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { types as MikroTypes } from "@mikro-orm/core";
import { Mission_db, User_db } from "./_allModels";

@Entity()
export class Eva_db implements Eva_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => User_db, { unique: false, primary: false })
  owner!: User_db;
  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;

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
  @Property({ type: MikroTypes.double, nullable: true })
  egressDuration: number;
  @Property({ type: MikroTypes.double, nullable: true })
  ingressDuration: number;
  @Property({ type: MikroTypes.string, nullable: true })
  egressLocationUuid!: string;
  @Property({ type: MikroTypes.string, nullable: true })
  ingressLocationUuid!: string;

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt!: Date;
}
