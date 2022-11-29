import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Poi } from "./poi.model";

@Entity()
export class Action {
  @PrimaryKey({ type: "number" })
  id!: number;

  @Property({ type: "string" })
  name!: string;

  @ManyToOne(() => Poi, { unique: false, primary: false })
  poi!: Poi;

  @Property({ type: "number", nullable: true })
  priorityOverride: number;

  @Property({ type: "json", nullable: true })
  stmUuidRefs: string[];

  @Property({ type: "string", unique: true })
  uuid!: string;

  @Property({ type: "string" })
  type!: ActionType;

  @Property({ type: "text" })
  description!: string;

  @Property({ type: "double" })
  durationLower!: number;

  @Property({ type: "double", nullable: true })
  durationUpper: number;

  @Property({ type: "json", nullable: true })
  inventoryItems: InventoryItem[];

  @Property({ type: "string" })
  status!: POIStatus;

  @Property({ type: "date" })
  createdAt: Date;

  @Property({ type: "date" })
  updatedAt: Date;
}
