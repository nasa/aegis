import { Migration } from "@mikro-orm/migrations";

export class Migration20250213200908 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "eva_db" add column "datetime" varchar(255) null;`);

    this.addSql(
      `alter table "sublayer_db" add column "is_time_based" boolean null, add column "time_layer_manifest" jsonb null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "eva_db" drop column "datetime";`);

    this.addSql(
      `alter table "sublayer_db" drop column "is_time_based", drop column "time_layer_manifest";`
    );
  }
}
