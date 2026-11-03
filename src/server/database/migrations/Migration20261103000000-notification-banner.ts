import { Migration } from "@mikro-orm/migrations";

export class Migration20261103000000 extends Migration {
  override up(): void {
    this.addSql(`
      create table notification_banner_db (
        id serial primary key,
        message text not null,
        enabled boolean not null default true,
        starts_at timestamptz(3) null,
        ends_at timestamptz(3) null,
        scope text not null,
        mission_ids integer[] not null default '{}',
        background_color text not null,
        text_color text not null,
        created_by text null,
        updated_by text null,
        created_at timestamptz(3) not null,
        updated_at timestamptz(3) not null,
        version integer not null default 1
      );
    `);
  }

  override down(): void {
    this.addSql(`drop table notification_banner_db;`);
  }
}
