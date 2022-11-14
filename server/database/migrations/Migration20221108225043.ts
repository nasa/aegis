import { Migration } from "@mikro-orm/migrations";

export class Migration20221108225043 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "poi" add constraint "poi_uuid_unique" unique ("uuid");');
  }

  async down(): Promise<void> {
    this.addSql('alter table "poi" drop constraint "poi_uuid_unique";');
  }
}
