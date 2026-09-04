import { Migration } from "@mikro-orm/migrations";

export class Migration20260827000001_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "automerge_operational_state_db" (
        "id" smallint not null default 1,
        "active_database_epoch" uuid null,
        "pending_database_epoch" uuid null,
        "state" text not null default 'ready',
        "reason" text null,
        "pipeline_id" text null,
        "job_id" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "automerge_operational_state_db_pkey" primary key ("id"),
        constraint "automerge_operational_state_db_singleton" check ("id" = 1),
        constraint "automerge_operational_state_db_state_check" check ("state" in ('ready', 'preparing', 'failed'))
      );
    `);
    this.addSql(`
      create table "automerge_document_revision_db" (
        "id" bigserial not null,
        "database_epoch" uuid not null,
        "mission_id" int not null,
        "revision_number" int not null,
        "automerge_url" text not null,
        "predecessor_id" bigint null,
        "state" text not null,
        "created_at" timestamptz not null default now(),
        "validated_at" timestamptz null,
        "activated_at" timestamptz null,
        "retired_at" timestamptz null,
        constraint "automerge_document_revision_db_pkey" primary key ("id"),
        constraint "automerge_document_revision_db_predecessor_foreign" foreign key ("predecessor_id") references "automerge_document_revision_db" ("id") on delete set null,
        constraint "automerge_document_revision_db_state_check" check ("state" in ('preparing', 'active', 'retired', 'failed')),
        constraint "automerge_document_revision_db_epoch_mission_unique" unique ("database_epoch", "mission_id"),
        constraint "automerge_document_revision_db_mission_number_unique" unique ("mission_id", "revision_number"),
        constraint "automerge_document_revision_db_url_unique" unique ("automerge_url")
      );
    `);
    this.addSql(
      'create unique index "automerge_document_revision_db_active_mission_unique" on "automerge_document_revision_db" ("mission_id") where "state" = \'active\';'
    );
  }

  override down(): void | Promise<void> {
    this.addSql('drop table if exists "automerge_document_revision_db" cascade;');
    this.addSql('drop table if exists "automerge_operational_state_db" cascade;');
  }
}
