import { defineEntity, p } from "@mikro-orm/postgresql";

/** One confirmed history-store action. Queried with raw SQL by `HistoryPersistence`. */
export const Mission_History_dbSchema = defineEntity({
  name: "Mission_History_db",
  properties: {
    documentId: p.text().fieldName("document_id").primary(),
    historyIndex: p.integer().fieldName("history_index").primary(),
    action: p.json<ConfirmedHistoryAction>(),
    statePriorToAction: p.json<object>().fieldName("state_prior_to_action").nullable(),
    createdAt: p.datetime(3).fieldName("created_at").nullable().defaultRaw("current_timestamp(3)"),
  },
});

export class Mission_History_db extends Mission_History_dbSchema.class {}
Mission_History_dbSchema.setClass(Mission_History_db);
