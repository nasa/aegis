import { defineEntity, p } from "@mikro-orm/postgresql";
import { Mission_Catalog_db } from "./mission_catalog.model";

// This derived read model is written by mission summary creation.
export const Mission_Eva_Catalog_dbSchema = defineEntity({
  name: "Mission_Eva_Catalog_db",
  properties: {
    missionId: p
      .manyToOne(Mission_Catalog_db)
      .mapToPk()
      .fieldName("mission_id")
      .primary()
      .deleteRule("cascade"),
    evaUuid: p.text().primary().index("mission_eva_catalog_uuid_idx"),
    name: p.text(),
    isAsPlanned: p.boolean(),
  },
});

export class Mission_Eva_Catalog_db extends Mission_Eva_Catalog_dbSchema.class {}
Mission_Eva_Catalog_dbSchema.setClass(Mission_Eva_Catalog_db);
