import { Migration } from "@mikro-orm/migrations";

export class Migration20261123000000 extends Migration {
  override up(): void {
    this.addSql(`
      create table mission_history_db (
        document_id text not null,
        history_index integer not null,
        action jsonb not null,
        state_prior_to_action jsonb null,
        created_at timestamptz(3) null default current_timestamp(3),
        primary key (document_id, history_index)
      );
    `);
  }

  override down(): void {
    this.addSql(`drop table mission_history_db;`);
  }
}
