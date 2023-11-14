import { Migration } from "@mikro-orm/migrations";

export class Migration20231102210928 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "eva_db" add column "egress_duration" double precision null, add column "ingress_duration" double precision null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "eva_db" drop column "egress_duration";');
    this.addSql('alter table "eva_db" drop column "ingress_duration";');
  }
}
