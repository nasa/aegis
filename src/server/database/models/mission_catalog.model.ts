import { defineEntity, p } from "@mikro-orm/postgresql";
import { Doc_Listing_db } from "./doc_listing.model";

// This derived read model is written by mission summary creation.
export const Mission_Catalog_dbSchema = defineEntity({
  name: "Mission_Catalog_db",
  properties: {
    missionId: p
      .manyToOne(Doc_Listing_db)
      .mapToPk()
      .fieldName("mission_id")
      .primary()
      .deleteRule("cascade"),
    summary: p.json<MissionSummary>(),
    version: p.integer().version(),
  },
});

export class Mission_Catalog_db extends Mission_Catalog_dbSchema.class {}
Mission_Catalog_dbSchema.setClass(Mission_Catalog_db);
