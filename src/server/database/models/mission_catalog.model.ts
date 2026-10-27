import { defineEntity, p } from "@mikro-orm/postgresql";
import { Doc_Listing_db } from "./doc_listing.model";

// These are derived read models. Only mission summary creation writes them.
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
    projectionVersion: p.integer(),
  },
});

export class Mission_Catalog_db extends Mission_Catalog_dbSchema.class {}
Mission_Catalog_dbSchema.setClass(Mission_Catalog_db);

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
