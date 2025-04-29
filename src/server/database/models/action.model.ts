import { Entity, ManyToOne, PrimaryKey, Property } from "@mikro-orm/core";
import { Poi_db, Station_db, Mission_db, Traverse_db } from "./_allModels";
import { types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Action_db implements Action_db_type {
  @PrimaryKey({ type: MikroTypes.string, unique: true })
  uuid!: string;

  @ManyToOne(() => Mission_db, { unique: false, primary: false })
  mission!: Mission_db;
  //an action can belong to either a POI, station, or traverse
  @ManyToOne(() => Poi_db, { unique: false, primary: false, nullable: true })
  poi: Poi_db;
  @ManyToOne(() => Station_db, { unique: false, primary: false, nullable: true })
  station: Station_db;
  @ManyToOne(() => Traverse_db, { unique: false, primary: false, nullable: true })
  traverse: Traverse_db;

  @ManyToOne(() => Action_db, { unique: false, primary: false, nullable: true })
  parentAction: Action_db;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)", nullable: true })
  parentCopyDate: Date;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.integer, nullable: true })
  priority: number;
  @Property({ type: MikroTypes.json, nullable: true })
  stmUuidRefs: string[];
  @Property({ type: MikroTypes.json, nullable: true })
  stmPriorities: StmPriorities;
  @Property({ type: MikroTypes.string })
  type!: ActionType;
  // Action v2 fields
  @Property({ type: MikroTypes.boolean, default: false })
  stmAction: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  actionDefinition: ActionDefinition;
  //

  @Property({ type: MikroTypes.text })
  description!: string;
  @Property({ type: MikroTypes.string, nullable: true })
  icon: string;
  @Property({ type: MikroTypes.json, nullable: true })
  location: AEGISPoint;
  @Property({ type: MikroTypes.float, nullable: true })
  elevation!: number;
  @Property({ type: MikroTypes.float, nullable: true })
  durationLower!: number;
  @Property({ type: MikroTypes.float, nullable: true })
  durationUpper: number;
  @Property({ type: MikroTypes.json, nullable: true })
  equipmentItemsUsage: EquipmentItemUsage[];
  @Property({ type: MikroTypes.json, nullable: true })
  geographicUnitsUsage: string[];
  @Property({ type: MikroTypes.float, nullable: true })
  mass: number;
  @Property({ type: MikroTypes.string })
  status!: POIStatus;
  @Property({ type: MikroTypes.boolean, default: true })
  enabled: boolean;
  @Property({ type: MikroTypes.json, nullable: true })
  crewAssigned: Crew[];

  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  createdAt: Date;
  @Property({ type: MikroTypes.datetime, columnType: "timestamptz(3)" })
  updatedAt: Date;
}
