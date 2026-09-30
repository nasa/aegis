import { Migration } from "@mikro-orm/migrations";

export class Migration20231121173726 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "eva_db" add column "egress_duration" double precision null, add column "ingress_duration" double precision null, add column "egress_location_uuid" varchar(255) null, add column "ingress_location_uuid" varchar(255) null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "eva_db" drop column "egress_duration";');
    this.addSql('alter table "eva_db" drop column "ingress_duration";');
    this.addSql('alter table "eva_db" drop column "egress_location_uuid";');
    this.addSql('alter table "eva_db" drop column "ingress_location_uuid";');
  }
}
