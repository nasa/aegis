import { Migration } from "@mikro-orm/migrations";

export class Migration20261029010000 extends Migration {
  override up(): void {
    this.addSql(
      `alter table terrain_profile_cache_db rename column fingerprint to input_signature;`
    );
  }

  override down(): void {
    this.addSql(
      `alter table terrain_profile_cache_db rename column input_signature to fingerprint;`
    );
  }
}
