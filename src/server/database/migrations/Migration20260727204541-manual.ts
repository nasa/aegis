import { Migration } from "@mikro-orm/migrations";

export class Migration20260727204541 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "environment_config_db" rename "url_override" to "value";`); // Rename column
    // Add new columns as nullable first so existing rows aren't rejected by the NOT NULL constraint
    this.addSql(
      `alter table "environment_config_db" add "key" text null, add "description" text null, add "created_at" timestamptz(3) null, add "updated_at" timestamptz(3) null;`
    );
    // Add data for row id 1 (the maestro url)
    this.addSql(
      `update "environment_config_db" set "key" = 'maestroServer', "description" = 'The URL of the Maestro server for Maegistro connection. Null means use the default in the .env file', "created_at" = now(), "updated_at" = now() where "id" = 1;`
    );
    // Now that all rows have values, enforce NOT NULL and uniqueness
    this.addSql(
      `alter table "environment_config_db" alter column "key" set not null, alter column "created_at" set not null, alter column "updated_at" set not null;`
    );
    this.addSql(
      `alter table "environment_config_db" add constraint "environment_config_db_key_unique" unique ("key");`
    );
    // The initial migration seeded row id=1 via an explicit-id INSERT, which does not advance the
    // SERIAL sequence. On a freshly migrated DB the sequence still returns 1 on the next
    // nextval(), so the first auto-assigned INSERT collides with the seed row. Force the sequence
    // past every existing id so subsequent inserts succeed. Idempotent on already-advanced DBs.
    this.addSql(
      `select setval('environment_config_db_id_seq', (select coalesce(max(id), 1) from "environment_config_db"));`
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "environment_config_db" drop constraint "environment_config_db_key_unique";`
    );
    this.addSql(
      `alter table "environment_config_db" drop column "key", drop column "value", drop column "description", drop column "created_at", drop column "updated_at";`
    );
    this.addSql(`alter table "environment_config_db" add "url_override" varchar(255) null;`);
  }
}
