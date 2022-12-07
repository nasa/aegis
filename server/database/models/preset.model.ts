import { Entity, ManyToOne, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";
import { v4 } from "uuid";
import { User } from "./user.model";
import { Mission } from "./mission.model";

@Entity()
export class Preset {
  @PrimaryKey({ type: MikroTypes.uuid })
  uuid: string = v4();

  @ManyToOne(() => User, { unique: false, primary: false })
  owner!: User;

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: MikroTypes.boolean })
  missionPreset: boolean = false;

  @Property({ type: MikroTypes.string })
  name: string;

  @Property({ type: MikroTypes.string })
  description: string;

  @Property({ type: MikroTypes.json, nullable: true })
  config!: LayerControls;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;

  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
