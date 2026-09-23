import { Migration } from "@mikro-orm/migrations";

/**
 * Replace the local username/password user table with a Launchpad-backed identity model and a
 * tiered per-mission grant model.
 *
 * Four tables replace one:
 *   app_user_db           every identity that has authenticated, plus the reserved Public user
 *   user_group_db         named groups
 *   user_group_member_db  user to group membership
 *   mission_permission_db grants, keyed to either a user or a group
 *
 * Existing accounts do not carry over because a uupic cannot be derived from a username. The one
 * exception is the shared guest account, whose view grants become grants on the Public user, since
 * both are shared principals rather than real identities.
 *
 * The super-user role is not stored here. It comes from the Launchpad token's NAMS roles, so there
 * is no reserved group and nothing to seed after a deploy.
 */
export class Migration20260916000000_manual extends Migration {
  override up(): void | Promise<void> {
    // Capture the guest account's view grants before the old table is dropped. permission_list is
    // jsonb of the form [{ "missionId": 3, "permissions": { "view": true, "edit": false } }].
    this.addSql(`
      create temporary table "tmp_public_missions" as
      select distinct (elem->>'missionId')::int as mission_id
      from "app_user_db" au
      cross join lateral jsonb_array_elements(au.permission_list) as elem
      where au.username = 'guest'
        and au.permission_list is not null
        and jsonb_typeof(au.permission_list) = 'array'
        and (elem->'permissions'->>'view')::boolean is true
        and elem->>'missionId' is not null;
    `);

    this.addSql(`drop table if exists "app_user_db" cascade;`);

    // One row per Launchpad identity, written on first authenticated request and never removed by
    // a grant change. `id` is therefore stable and safe to use as `owner_id` on entities.
    this.addSql(`
      create table "app_user_db" (
        "id" serial primary key,
        "uupic" text not null,
        "auid" text not null,
        "display_name" text not null,
        "is_system" boolean not null default false,
        "last_login_at" double precision not null,
        "version" int not null default 1
      );
    `);
    this.addSql(
      `alter table "app_user_db" add constraint "app_user_db_uupic_unique" unique ("uupic");`
    );

    this.addSql(`
      create table "user_group_db" (
        "id" serial primary key,
        "name" text not null,
        "description" text null,
        "notes" text null,
        "created_at" double precision not null,
        "updated_at" double precision not null,
        "version" int not null default 1
      );
    `);
    this.addSql(
      `alter table "user_group_db" add constraint "user_group_db_name_unique" unique ("name");`
    );

    this.addSql(`
      create table "user_group_member_db" (
        "id" serial primary key,
        "group_id" int not null,
        "user_id" int not null,
        "created_at" double precision not null,
        "updated_at" double precision not null,
        "version" int not null default 1
      );
    `);
    this.addSql(`
      alter table "user_group_member_db" add constraint "user_group_member_db_unique"
        unique ("group_id", "user_id");
    `);
    this.addSql(`
      alter table "user_group_member_db" add constraint "user_group_member_db_group_id_foreign"
        foreign key ("group_id") references "user_group_db" ("id") on delete cascade;
    `);
    this.addSql(`
      alter table "user_group_member_db" add constraint "user_group_member_db_user_id_foreign"
        foreign key ("user_id") references "app_user_db" ("id") on delete cascade;
    `);

    this.addSql(`
      create table "mission_permission_db" (
        "id" serial primary key,
        "mission_id" int not null,
        "user_id" int null,
        "group_id" int null,
        "perm_level" text not null,
        "notes" text null,
        "granted_by" int null,
        "created_at" double precision not null,
        "updated_at" double precision not null,
        "version" int not null default 1
      );
    `);

    // Exactly one subject per grant.
    this.addSql(`
      alter table "mission_permission_db" add constraint "mission_permission_db_subject_check"
        check (("user_id" is null) <> ("group_id" is null));
    `);
    // Partial indexes, because NULLs do not collide in a plain unique constraint.
    this.addSql(`
      create unique index "mission_permission_db_mission_user_unique"
        on "mission_permission_db" ("mission_id", "user_id") where "user_id" is not null;
    `);
    this.addSql(`
      create unique index "mission_permission_db_mission_group_unique"
        on "mission_permission_db" ("mission_id", "group_id") where "group_id" is not null;
    `);
    this.addSql(`
      alter table "mission_permission_db" add constraint "mission_permission_db_mission_id_foreign"
        foreign key ("mission_id") references "doc_listing_db" ("mission_id") on delete cascade;
    `);
    this.addSql(`
      alter table "mission_permission_db" add constraint "mission_permission_db_user_id_foreign"
        foreign key ("user_id") references "app_user_db" ("id") on delete cascade;
    `);
    this.addSql(`
      alter table "mission_permission_db" add constraint "mission_permission_db_group_id_foreign"
        foreign key ("group_id") references "user_group_db" ("id") on delete cascade;
    `);
    this.addSql(`
      alter table "mission_permission_db" add constraint "mission_permission_db_granted_by_foreign"
        foreign key ("granted_by") references "app_user_db" ("id") on delete no action;
    `);
    this.addSql(
      `create index "mission_permission_db_user_id_index" on "mission_permission_db" ("user_id");`
    );
    this.addSql(
      `create index "mission_permission_db_group_id_index" on "mission_permission_db" ("group_id");`
    );
    this.addSql(
      `create index "mission_permission_db_mission_id_index" on "mission_permission_db" ("mission_id");`
    );

    // The reserved Public user. Its grants are union-ed into everyone's access, so it needs a row
    // to hang them from even though it has no Launchpad identity and never logs in.
    this.addSql(`
      insert into "app_user_db" ("uupic", "auid", "display_name", "is_system", "last_login_at")
      values ('__public__', 'public', 'Public', true, extract(epoch from now()) * 1000);
    `);

    // Replay the captured guest grants against the Public user. The join to doc_listing_db drops
    // any mission id that no longer exists, which the old jsonb column could not enforce and
    // which would otherwise violate the new foreign key.
    this.addSql(`
      insert into "mission_permission_db"
        ("mission_id", "user_id", "perm_level", "notes", "created_at", "updated_at")
      select t.mission_id,
             (select id from "app_user_db" where uupic = '__public__'),
             'viewer',
             'Migrated from the legacy guest account',
             extract(epoch from now()) * 1000,
             extract(epoch from now()) * 1000
      from "tmp_public_missions" t
      join "doc_listing_db" dl on dl.mission_id = t.mission_id;
    `);

    this.addSql(`drop table "tmp_public_missions";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "mission_permission_db" cascade;`);
    this.addSql(`drop table if exists "user_group_member_db" cascade;`);
    this.addSql(`drop table if exists "user_group_db" cascade;`);
    this.addSql(`drop table if exists "app_user_db" cascade;`);

    // Recreated empty. Bcrypt passwords cannot be restored, and the migrated guest grants are not
    // written back to their original jsonb form.
    this.addSql(`
      create table "app_user_db" (
        "id" serial primary key,
        "username" text not null,
        "password" text null,
        "is_super_admin" boolean null default false,
        "is_admin" boolean null default false,
        "permission_list" jsonb null,
        "created_at" timestamptz(3) not null,
        "updated_at" timestamptz(3) not null,
        "version" int not null default 1
      );
    `);
  }
}
