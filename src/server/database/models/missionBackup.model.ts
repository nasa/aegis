import { Entity, PrimaryKey, Property, types as MikroTypes } from "@mikro-orm/postgresql";

@Entity({ tableName: "mission_backup_db" })
export class MissionBackup_db {
  @PrimaryKey({ type: MikroTypes.integer })
  missionId!: number;

  @Property({ type: MikroTypes.json, columnType: "jsonb" })
  data!: object;
}
