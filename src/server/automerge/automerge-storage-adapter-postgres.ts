import type { Chunk, StorageAdapterInterface, StorageKey } from "@automerge/automerge-repo";
import pg from "pg";

function keyToArray(key: StorageKey): Buffer[] {
  return key.map((k) => Buffer.from(k, "utf8"));
}

function arrayToKey(array: Buffer[]): StorageKey {
  return array.map((a) => a.toString("utf8"));
}

function keyPrefixRange(keyPrefix: StorageKey): [Buffer[], Buffer[]] {
  const lowerBound = keyToArray(keyPrefix);

  // make a copy of lowerBound
  const upperBound = lowerBound.map((buf) => Buffer.from(buf));

  // append a null byte to the last element of upperBound
  // this is the "next" key after all keys prefixed by keyPrefix, sorted lexicographically
  upperBound[upperBound.length - 1] = Buffer.concat([
    upperBound[upperBound.length - 1],
    Buffer.from([0]),
  ]);

  return [lowerBound, upperBound];
}

export class PostgresStorageAdapter implements StorageAdapterInterface {
  private pool: pg.Pool;
  private tableName: string;

  constructor(tableName: string, pool?: pg.Pool) {
    if (pool) {
      this.pool = pool;
    } else {
      this.pool = new pg.Pool();
    }
    this.tableName = pg.escapeIdentifier(tableName);
  }

  async load(key: StorageKey): Promise<Uint8Array | undefined> {
    const keyArray = keyToArray(key);
    const result = await this.pool.query(`select value from ${this.tableName} where key = $1`, [
      keyArray,
    ]);
    if (result.rows.length == 0) {
      return undefined;
    }
    return Uint8Array.from(result.rows[0].value);
  }

  async save(key: StorageKey, data: Uint8Array): Promise<void> {
    const keyArray = keyToArray(key);
    await this.pool.query(
      `insert into ${this.tableName} (key, value) values ($1, $2)` +
        "on conflict (key) do update set value = $2",
      [keyArray, Buffer.from(data)]
    );
  }

  async remove(key: StorageKey): Promise<void> {
    const keyArray = keyToArray(key);
    await this.pool.query(`delete from ${this.tableName} where key = $1`, [keyArray]);
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    let result;
    if (keyPrefix.length == 0) {
      result = await this.pool.query(`select key, value from ${this.tableName}`);
    } else {
      const [lowerBound, upperBound] = keyPrefixRange(keyPrefix);
      result = await this.pool.query(
        `select key, value from ${this.tableName} where key >= $1 and key < $2`,
        [lowerBound, upperBound]
      );
    }
    return result.rows.map((row) => ({
      key: arrayToKey(row.key),
      data: Uint8Array.from(row.value),
    }));
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    if (keyPrefix.length == 0) {
      await this.pool.query(`delete from ${this.tableName}`);
      return;
    }
    const [lowerBound, upperBound] = keyPrefixRange(keyPrefix);
    await this.pool.query(`delete from ${this.tableName} where key >= $1 and key < $2`, [
      lowerBound,
      upperBound,
    ]);
  }
}
