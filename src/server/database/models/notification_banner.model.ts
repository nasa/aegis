import { defineEntity, p } from "@mikro-orm/postgresql";

export const Notification_Banner_dbSchema = defineEntity({
  name: "Notification_Banner_db",
  properties: {
    id: p.integer().autoincrement().primary(),
    message: p.text(),
    enabled: p.boolean().default(true),
    // null means the window has no start / end limit
    startsAt: p.datetime(3).nullable(),
    endsAt: p.datetime(3).nullable(),
    scope: p.text(),
    // mission ids for scope "missions"; empty for scope "application"
    missionIds: p
      .array<number>(
        (value) => Number(value),
        (value) => String(value)
      )
      .columnType("integer[]")
      .defaultRaw("'{}'"),
    backgroundColor: p.text(),
    textColor: p.text(),
    createdBy: p.text().nullable(),
    updatedBy: p.text().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Notification_Banner_db extends Notification_Banner_dbSchema.class {}

Notification_Banner_dbSchema.setClass(Notification_Banner_db);
