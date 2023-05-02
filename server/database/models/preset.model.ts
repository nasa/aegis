import { Entity, ManyToOne, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";
import { User } from "./user.model";
import { Mission } from "./mission.model";

@Entity()
export class Preset implements Preset_db_type {
  @PrimaryKey({ type: MikroTypes.uuid, unique: true })
  uuid!: string;

  @ManyToOne(() => User, { unique: false, primary: false })
  owner!: User;
  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: MikroTypes.text })
  name: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description: string;
  @Property({ type: MikroTypes.boolean, default: false })
  missionPreset: boolean;
  @Property({ type: MikroTypes.boolean, default: false })
  missionPresetDefault: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  layerControls!: LayerControls;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
