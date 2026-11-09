import { Migration } from "@mikro-orm/migrations";

export class Migration20261110000000 extends Migration {
  override up(): void {
    this.addSql(`
      create table newton_traverse_db (
        uuid uuid primary key,
        request_key text not null,
        request jsonb not null,
        status text not null,
        newton_traverse_id text null,
        request_hash text null,
        deduplicated boolean not null default false,
        effective_problem jsonb null,
        raw_path jsonb null,
        raw_vertex_count integer null,
        path jsonb null,
        segment_distances jsonb null,
        map_info jsonb null,
        runtime_ms integer null,
        error jsonb null,
        maps_fingerprint text null,
        submit_attempts integer not null default 0,
        next_submit_at timestamptz(3) null,
        submitted_at timestamptz(3) null,
        last_polled_at timestamptz(3) null,
        finished_at timestamptz(3) null,
        first_username text null,
        created_at timestamptz(3) not null,
        updated_at timestamptz(3) not null,
        constraint newton_traverse_db_request_key_unique unique (request_key)
      );
      create index newton_traverse_db_status_index on newton_traverse_db(status);
    `);
  }

  override down(): void {
    this.addSql(`drop table newton_traverse_db;`);
  }
}
