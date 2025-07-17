import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Mission_db implements Mission_db_type {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  missionBanner: string;
  @Property({ type: MikroTypes.integer })
  version!: number;
  @Property({ type: MikroTypes.integer, default: 1 })
  actionSystemVersion!: number;
  @Property({ type: MikroTypes.json, nullable: true })
  landerLocation: AEGISPoint;
  @Property({ type: MikroTypes.float, nullable: true })
  traverseRate: number;
  @Property({ type: MikroTypes.float, nullable: true })
  landerElevationMeters: number;
  @Property({ type: MikroTypes.float, nullable: true })
  defaultEvaDuration: number;
  @Property({ type: MikroTypes.float, nullable: true, default: 2 })
  walkbackRate: number;
  @Property({ type: MikroTypes.json, nullable: true })
  equipmentItems: EquipmentItem[];
  @Property({ type: MikroTypes.json, nullable: true })
  geographicUnits: GeographicUnit[];
  @Property({ type: MikroTypes.string, nullable: true })
  activeGridUuid: string;
  @Property({ type: MikroTypes.float, nullable: true })
  planetRadius: number;
  @Property({ type: MikroTypes.float, nullable: true })
  initialZoom: number;
  @Property({ type: MikroTypes.text, nullable: true })
  demFilePath: string;
  @Property({ type: MikroTypes.float, nullable: true })
  demResolution: number;
  @Property({ type: MikroTypes.boolean, default: false })
  projIsCustom: boolean;
  @Property({ type: MikroTypes.text, nullable: true })
  projEpsg: string;
  @Property({ type: MikroTypes.text, nullable: true })
  projProj4String: string;
  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMinX: number;
  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMinY: number;
  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMaxX: number;
  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMaxY: number;
  @Property({ type: MikroTypes.float, nullable: true })
  projOriginX: number;
  @Property({ type: MikroTypes.float, nullable: true })
  projOriginY: number;
  @Property({ type: MikroTypes.float, nullable: true })
  projResZoomLevel: number;
  @Property({ type: MikroTypes.float, nullable: true })
  projResUnitsPerPixel: number;
  @Property({ type: MikroTypes.json, nullable: true })
  circleDefinitions: CircleDefinition[];
  @Property({ type: MikroTypes.json, nullable: true })
  actionTemplates: ActionTemplate[];
  @Property({ type: MikroTypes.boolean, default: true })
  stmLevel1Enabled: boolean;
  @Property({ type: MikroTypes.text, nullable: true, default: "Goal" })
  stmLevel1Name: string;
  @Property({ type: MikroTypes.text, nullable: true, default: "Objective" })
  stmLevel2Name: string;
  @Property({ type: MikroTypes.text, nullable: true, default: "Investigation" })
  stmLevel3Name: string;
  @Property({ type: MikroTypes.json, nullable: true })
  actionDefinitions: ActionDefinitions;
  @Property({ type: MikroTypes.boolean, default: false })
  isArchived: boolean;

  @Property({ type: MikroTypes.datetime, length: 3 })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime, length: 3 })
  updatedAt!: Date;
}
