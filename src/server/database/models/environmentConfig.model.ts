import { defineEntity, p } from "@mikro-orm/postgresql";

export const EnvironmentConfig_dbSchema = defineEntity({
  name: "EnvironmentConfig_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    key: p.text().unique(),
    value: p.string().nullable(),
    description: p.text().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class EnvironmentConfig_db extends EnvironmentConfig_dbSchema.class {
  override value: string | null = null;
  override description: string | null = null;
}

EnvironmentConfig_dbSchema.setClass(EnvironmentConfig_db);
