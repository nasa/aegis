import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Mission } from "./mission.model";
import { User } from "./user.model";

type PoiModel = {
  id: number;
  owner: User;
  mission: Mission;
  name: string;
  description: string;
  actions: Action[];
  priorityOverride: number;
  radius: number;
  uuid: string;
  location: Point | Point[];
  color: POIColor;
  tags: string[];
  status: POIStatus;
  createdAt: Date;
  updatedAt: Date;
};

@Entity()
export class Poi implements PoiModel {
  @PrimaryKey({ type: "number" })
  id!: number;

  @ManyToOne(() => User, { unique: false, primary: false })
  owner!: User;

  @ManyToOne(() => Mission, { unique: false, primary: false })
  mission!: Mission;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "string" })
  description!: string;

  @Property({ type: "json", nullable: true })
  actions!: Action[];

  @Property({ type: "number", nullable: true })
  priorityOverride: number;

  @Property({ type: "number" })
  radius!: number;

  @Property({ type: "string", unique: true })
  uuid!: string;

  @Property({ type: "json", nullable: true })
  location: Point | Point[];

  @Property({ type: "json", nullable: true })
  color: POIColor;

  @Property({ type: "json", nullable: true })
  tags: string[];

  @Property({ type: "string" })
  status!: POIStatus;

  @Property({ type: "date" })
  createdAt: Date;

  @Property({ type: "date" })
  updatedAt: Date;

  constructor(poi: PoiModel) {
    this.owner = poi.owner;
    this.mission = poi.mission;
    this.name = poi.name;
    this.description = poi.description;
    this.actions = poi.actions;
    this.priorityOverride = poi.priorityOverride;
    this.radius = poi.radius;
    this.uuid = poi.uuid;
    this.location = poi.location;
    this.color = poi.color;
    this.tags = poi.tags;
    this.status = poi.status;
  }
}
