import { defineEntity, p } from "@mikro-orm/postgresql";

export const Folder_dbSchema = defineEntity({
  name: "Folder_db",
  properties: {
    uuid: p.string().unique().primary(),
    missionId: p.integer(),
    name: p.text(),
    type: p.text().$type<FolderType>(),
    items: p.json<string[]>(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Folder_db extends Folder_dbSchema.class implements Folder_db_type {}

Folder_dbSchema.setClass(Folder_db);
