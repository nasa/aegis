import { defineEntity, p } from "@mikro-orm/postgresql";

// MikroORM's migrator owns this table; schema generation excludes it.
export const Mikro_Orm_MigrationsSchema = defineEntity({
  name: "Mikro_Orm_Migrations",
  tableName: "mikro_orm_migrations",
  readonly: true,
  properties: {
    id: p.integer().autoincrement().primary(),
    name: p.string(),
    executedAt: p.datetime().defaultRaw("current_timestamp"),
  },
});

export class Mikro_Orm_Migrations extends Mikro_Orm_MigrationsSchema.class {}

Mikro_Orm_MigrationsSchema.setClass(Mikro_Orm_Migrations);
