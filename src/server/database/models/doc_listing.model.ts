import { defineEntity, p } from "@mikro-orm/postgresql";

export const Doc_Listing_dbSchema = defineEntity({
  name: "Doc_Listing_db",
  properties: {
    missionId: p.integer().autoincrement().primary(),
    automergeUrl: p.text().nullable(),
    version: p.integer().version(),
  },
});

export class Doc_Listing_db extends Doc_Listing_dbSchema.class implements DocListing_db_type {}

Doc_Listing_dbSchema.setClass(Doc_Listing_db);
