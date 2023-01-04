import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Poi } from "./poi.model";
import { Station } from "./station.model";
import { types as MikroTypes } from "@mikro-orm/core";
import { Mission } from "./mission.model";

@Entity()
export class Action implements Action_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;
  //an action can belong to either a POI or a station. but not both
  @ManyToOne(() => Poi, { unique: false, primary: false, nullable: true })
  poi: Poi;
  @ManyToOne(() => Station, { unique: false, primary: false, nullable: true })
  station: Station;

  @Property({ type: MikroTypes.string })
  name!: string;
  @Property({ type: MikroTypes.integer, nullable: true })
  priorityOverride: number;
  @Property({ type: MikroTypes.json, nullable: true })
  stmUuidRefs: string[];
  @Property({ type: MikroTypes.string })
  type!: ActionType;
  @Property({ type: MikroTypes.string })
  description!: string;
  @Property({ type: MikroTypes.double })
  durationLower!: number;
  @Property({ type: MikroTypes.double, nullable: true })
  durationUpper: number;
  @Property({ type: MikroTypes.json, nullable: true })
  inventoryItems: InventoryItem[];
  @Property({ type: MikroTypes.string })
  status!: POIStatus;

  @Property({ type: MikroTypes.datetime })
  createdAt: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt: Date;
}
