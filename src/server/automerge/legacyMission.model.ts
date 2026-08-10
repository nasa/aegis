import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";
import { types as MikroTypes } from "@mikro-orm/postgresql";

@Entity({ tableName: "mission_db" })
export class LegacyMissionDb {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text })
  name!: string;

  @Property({ type: MikroTypes.text })
  description!: string;

  @Property({ type: MikroTypes.text, nullable: true })
  missionBanner!: string | null;

  @Property({ type: MikroTypes.integer, default: 1 })
  actionSystemVersion!: number;

  @Property({ type: MikroTypes.json, nullable: true })
  landerLocation!: AEGISPoint | null;

  @Property({ type: MikroTypes.float, nullable: true })
  traverseRate!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  landerElevationMeters!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  defaultEvaDuration!: number | null;

  @Property({ type: MikroTypes.float, nullable: true, default: 2 })
  walkbackRate!: number | null;

  @Property({ type: MikroTypes.json, nullable: true })
  equipmentItems!: EquipmentItems | null;

  @Property({ type: MikroTypes.json, nullable: true })
  geographicUnits!: GeographicUnits | null;

  @Property({ type: MikroTypes.string, nullable: true })
  activeGridUuid!: string | null;

  @Property({ type: MikroTypes.float, nullable: true })
  planetRadius!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  initialZoom!: number | null;

  @Property({ type: MikroTypes.text, nullable: true })
  demFilePath!: string | null;

  @Property({ type: MikroTypes.float, nullable: true })
  demResolution!: number | null;

  @Property({ type: MikroTypes.boolean, default: false })
  projIsCustom!: boolean;

  @Property({ type: MikroTypes.text, nullable: true })
  projEpsg!: string | null;

  @Property({ type: MikroTypes.text, nullable: true })
  projProj4String!: string | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMinX!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMinY!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMaxX!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projBoundsMaxY!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projOriginX!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projOriginY!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projResZoomLevel!: number | null;

  @Property({ type: MikroTypes.float, nullable: true })
  projResUnitsPerPixel!: number | null;

  @Property({ type: MikroTypes.json, nullable: true })
  circleDefinitions!: CircleDefinitions | null;

  @Property({ type: MikroTypes.json, nullable: true })
  actionTemplates!: ActionTemplates | null;

  @Property({ type: MikroTypes.boolean, default: true })
  stmLevel1Enabled!: boolean;

  @Property({ type: MikroTypes.text, nullable: true, default: "Goal" })
  stmLevel1Name!: string | null;

  @Property({ type: MikroTypes.text, nullable: true, default: "Objective" })
  stmLevel2Name!: string | null;

  @Property({ type: MikroTypes.text, nullable: true, default: "Investigation" })
  stmLevel3Name!: string | null;

  @Property({ type: MikroTypes.json, nullable: true })
  actionDefinitions!: ActionDefinitions | null;

  @Property({ type: MikroTypes.boolean, default: false })
  isArchived!: boolean;

  @Property({ type: MikroTypes.boolean, default: false })
  usingLGRSCoordinates!: boolean;

  @Property({ type: MikroTypes.double })
  createdAt!: number;

  @Property({ type: MikroTypes.double })
  updatedAt!: number;

  @Property({ type: MikroTypes.integer, version: true })
  version!: number;
}
