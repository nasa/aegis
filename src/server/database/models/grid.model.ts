import { defineEntity, p } from "@mikro-orm/postgresql";

export const Grid_dbSchema = defineEntity({
  name: "Grid_db",
  properties: {
    uuid: p.string().unique().primary(),
    missionId: p.integer().nullable(),
    numRows: p.integer().nullable(),
    numCols: p.integer().nullable(),
    spacing: p.integer().nullable(),
    name: p.text().nullable(),
    fileName: p.text().nullable(),
    isActiveGrid: p.boolean().nullable(),
    version: p.integer().version(),
  },
});

export class Grid_db extends Grid_dbSchema.class {}

Grid_dbSchema.setClass(Grid_db);
