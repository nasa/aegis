import { Migration } from "@mikro-orm/migrations";

export class Migration20250910170808 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "app_user_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "mission_db" drop column "version";`);
    this.addSql(`alter table "mission_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "layer_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "grid_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "folder_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "eva_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "poi_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "preset_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "station_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "stm_level1_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "stm_level2_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "stm_level3_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "stm_rule_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "sublayer_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "traverse_db" add column "version" int not null default 1;`);

    this.addSql(`alter table "action_db" add column "version" int not null default 1;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "action_db" drop column "version";`);

    this.addSql(`alter table "app_user_db" drop column "version";`);

    this.addSql(`alter table "eva_db" drop column "version";`);

    this.addSql(`alter table "folder_db" drop column "version";`);

    this.addSql(`alter table "grid_db" drop column "version";`);

    this.addSql(`alter table "layer_db" drop column "version";`);

    this.addSql(`alter table "mission_db" drop column "version";`);
    this.addSql(`alter table "mission_db" add column "version" int;`);

    this.addSql(`alter table "poi_db" drop column "version";`);

    this.addSql(`alter table "preset_db" drop column "version";`);

    this.addSql(`alter table "station_db" drop column "version";`);

    this.addSql(`alter table "stm_level1_db" drop column "version";`);

    this.addSql(`alter table "stm_level2_db" drop column "version";`);

    this.addSql(`alter table "stm_level3_db" drop column "version";`);

    this.addSql(`alter table "stm_rule_db" drop column "version";`);

    this.addSql(`alter table "sublayer_db" drop column "version";`);

    this.addSql(`alter table "traverse_db" drop column "version";`);
  }
}
