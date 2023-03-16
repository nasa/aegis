import { Entity, ManyToOne, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";
import { Mission } from "./mission.model";

@Entity()
export class Layer implements Layer_db_type {
  @PrimaryKey({ type: MikroTypes.uuid })
  uuid: string;

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: MikroTypes.json, nullable: true })
  layerConfig!: LayerConfig;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
