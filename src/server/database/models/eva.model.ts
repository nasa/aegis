import { defineEntity, p } from "@mikro-orm/postgresql";

export const Eva_dbSchema = defineEntity({
  name: "Eva_db",
  properties: {
    uuid: p.string().unique().primary(),
    refUuid: p.string().defaultRaw("uuid_generate_v4()"),
    missionId: p.integer(),
    name: p.text(),
    status: p.string().$type<StationStatus>(),
    sequence: p.json<EvaSequenceItem[]>().nullable(),
    description: p.text(),
    duration: p.float().nullable(),
    traverseRate: p.float().nullable(),
    egressDuration: p.float().nullable(),
    ingressDuration: p.float().nullable(),
    egressLocationUuid: p.string().nullable(),
    ingressLocationUuid: p.string().nullable(),
    traverseColor: p.string().nullable(),
    ownerId: p.integer().nullable(),
    datetime: p.string().nullable(),
    showEditWarning: p.boolean().default(false),
    editWarningMsg: p.text().nullable(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class Eva_db extends Eva_dbSchema.class implements Eva_db_type {}

Eva_dbSchema.setClass(Eva_db);
