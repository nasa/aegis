import { Migration } from "@mikro-orm/migrations";

export class Migration20240911195215 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "mission_db" add column "action_system_version" int not null default 1, add column "action_definitions" jsonb null;'
    );

    this.addSql(
      'alter table "action_db" add column "stm_action" boolean not null default false, add column "action_definition" jsonb null;'
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      'alter table "action_db" drop column "stm_action", drop column "action_definition";'
    );

    this.addSql(
      'alter table "mission_db" drop column "action_system_version", drop column "action_definitions";'
    );
  }
}
