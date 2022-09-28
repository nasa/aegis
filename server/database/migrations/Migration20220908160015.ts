import { Migration } from "@mikro-orm/migrations";

export class Migration20220908160015 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "mission" ("id" serial primary key, "mission" varchar(255) not null, "config" jsonb null, "version" int not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );

    this.addSql(
      'create table "user" ("id" serial primary key, "username" varchar(255) not null, "email" varchar(255) not null, "password" varchar(255) not null, "permission" text check ("permission" in (\'admin\', \'user\')) not null, "token" varchar(2048) null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );
  }
}
