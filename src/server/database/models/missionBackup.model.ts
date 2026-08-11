import { defineEntity, p } from "@mikro-orm/postgresql";

export const MissionBackup_dbSchema = defineEntity({
  name: "MissionBackup_db",
  tableName: "mission_backup_db",
  properties: {
    missionId: p.integer().primary().autoincrement(false),
    data: p.json<object>().columnType("jsonb"),
  },
});

export class MissionBackup_db extends MissionBackup_dbSchema.class {}

MissionBackup_dbSchema.setClass(MissionBackup_db);
