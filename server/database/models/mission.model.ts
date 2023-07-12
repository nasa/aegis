import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/core";

@Entity()
export class Mission implements Mission_db_type {
  @PrimaryKey({ type: MikroTypes.integer })
  id!: number;

  @Property({ type: MikroTypes.text })
  name!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  description!: string;
  @Property({ type: MikroTypes.text, nullable: true })
  missionBanner: string;
  @Property({ type: MikroTypes.json, nullable: true })
  config!: Config;
  @Property({ type: MikroTypes.integer })
  version!: number;
  @Property({ type: MikroTypes.json, nullable: true })
  landerLocation: AEGISPoint;
  @Property({ type: MikroTypes.double, nullable: true })
  traverseSpeed: number;
  @Property({ type: MikroTypes.double, nullable: true })
  landerElevationMeters: number;
  @Property({ type: MikroTypes.double, nullable: true })
  sunAzimuth: number;
  @Property({ type: MikroTypes.double, nullable: true })
  earthAzimuth: number;
  @Property({ type: MikroTypes.boolean, default: false })
  sunAzimuthVisible: boolean;
  @Property({ type: MikroTypes.boolean, default: false })
  earthAzimuthVisible: boolean;
  @Property({ type: MikroTypes.double, nullable: true })
  defaultEvaDuration: number;
  @Property({ type: MikroTypes.double, nullable: true, default: 2 })
  walkbackSpeed: number;
  @Property({ type: MikroTypes.json, nullable: true })
  equipmentItems: EquipmentItem[];
  @Property({ type: MikroTypes.double, nullable: true })
  planetRadius: number;
  @Property({ type: MikroTypes.double, nullable: true })
  initialZoom: number;
  @Property({ type: MikroTypes.text, nullable: true })
  demFilePath: string;
  @Property({ type: MikroTypes.double, nullable: true })
  demResolution: number;
  @Property({ type: MikroTypes.boolean, default: false })
  projIsCustom: boolean;
  @Property({ type: MikroTypes.text, nullable: true })
  projEpsg: string;
  @Property({ type: MikroTypes.text, nullable: true })
  projProj4String: string;
  @Property({ type: MikroTypes.double, nullable: true })
  projBoundsMinX: number;
  @Property({ type: MikroTypes.double, nullable: true })
  projBoundsMinY: number;
  @Property({ type: MikroTypes.double, nullable: true })
  projBoundsMaxX: number;
  @Property({ type: MikroTypes.double, nullable: true })
  projBoundsMaxY: number;
  @Property({ type: MikroTypes.double, nullable: true })
  projOriginX: number;
  @Property({ type: MikroTypes.double, nullable: true })
  projOriginY: number;
  @Property({ type: MikroTypes.double, nullable: true })
  projResZoomLevel: number;
  @Property({ type: MikroTypes.double, nullable: true })
  projResUnitsPerPixel: number;

  @Property({ type: MikroTypes.datetime })
  createdAt!: Date;
  @Property({ type: MikroTypes.datetime })
  updatedAt!: Date;
}
