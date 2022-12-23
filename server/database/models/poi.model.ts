import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";

import { Mission } from "./mission.model";
import { User } from "./user.model";
import { types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Poi implements Poi_db_type {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @ManyToOne(() => User, { unique: false, primary: false })
  owner!: User;

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: MikroTypes.string })
  name!: string;

  @Property({ type: MikroTypes.text })
  description!: string;

  @Property({ type: MikroTypes.integer, nullable: true })
  priorityOverride: number;

  @Property({ type: MikroTypes.float })
  radius!: number;

  @Property({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @Property({ type: MikroTypes.json, nullable: true })
  location: Point | Point[];

  @Property({ type: MikroTypes.json, nullable: true })
  color: POIColor;

  @Property({ type: MikroTypes.json, nullable: true })
  tags: string[];

  @Property({ type: MikroTypes.string })
  status!: POIStatus;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;

  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
