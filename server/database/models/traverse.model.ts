import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Mission } from "./mission.model";
import { types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Traverse implements Traverse_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.json, nullable: true })
  location: AEGISPoint[];
  @Property({ type: MikroTypes.double, nullable: true })
  duration: number;
  @Property({ type: MikroTypes.string, nullable: true })
  description: string;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
