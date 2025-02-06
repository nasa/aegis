import { Migration } from "@mikro-orm/migrations";

export class Migration20250205145203 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "sublayer_db" add column "path" text null;`);
    this.addSql(`alter table "sublayer_db" add column "tile_pattern" text null;`);

    // update the tile pattern value
    this.addSql(`
      UPDATE "sublayer_db"
      SET "tile_pattern" = CASE
        WHEN "type" = 'tile' THEN SUBSTRING("url" FROM POSITION('/' IN "url") + 1)
        ELSE "tile_pattern"
      END;
    `);
    // update the path column based on the type
    this.addSql(`
      UPDATE "sublayer_db"
      SET "path" = CASE
        WHEN "type" = 'tile' THEN LEFT("url", POSITION('/' IN "url") - 1)
        WHEN "type" = 'vector' THEN "file_path"
        ELSE "path"
      END;
    `);
    // drop url and filePath
    this.addSql(`alter table "sublayer_db" drop column "url";`);
    this.addSql(`alter table "sublayer_db" drop column "file_path";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "sublayer_db" drop column "path";`);
    this.addSql(`alter table "sublayer_db" drop column "tile_pattern";`);
    this.addSql(`alter table "sublayer_db" add column "file_path" text null;`);
    this.addSql(
      `alter table "sublayer_db" add column "url" text null, add column "file_path" text null;`
    );
  }
}
