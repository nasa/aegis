import type {
  Chunk,
  DocumentId,
  StorageAdapterInterface,
  StorageKey,
} from "@automerge/automerge-repo";
import pg from "pg";
import { serverLogger } from "utils/logging/serverLogger";

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
  // Synchronous notification only: listeners must not await a repo flush inside save().
  onDocumentSaved?: (documentId: DocumentId) => void;
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
    const started = Date.now();
    const keyArray = keyToArray(key);
    try {
      await this.pool.query(
        `insert into ${this.tableName} (key, value) values ($1, $2)` +
          "on conflict (key) do update set value = $2",
        [keyArray, Buffer.from(data)]
      );
    } catch (error) {
      serverLogger.error(
        {
          logId: "mission-storage",
          logValue: "Automerge storage save failed",
          documentId: key[0],
          chunkType: key[1],
          bytes: data.byteLength,
          durationMs: Date.now() - started,
        },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
    if (key[1] === "snapshot" || key[1] === "incremental") {
      const durationMs = Date.now() - started;
      serverLogger[durationMs >= 1000 ? "warning" : "debug"]({
        logId: "mission-storage",
        logValue: "Automerge document chunk saved",
        documentId: key[0],
        chunkType: key[1],
        bytes: data.byteLength,
        durationMs,
        catalogListenerAttached: !!this.onDocumentSaved,
      });
      this.onDocumentSaved?.(key[0] as DocumentId);
    }
  }

  async remove(key: StorageKey): Promise<void> {
    const keyArray = keyToArray(key);
    await this.pool.query(`delete from ${this.tableName} where key = $1`, [keyArray]);
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    const started = Date.now();
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
    const durationMs = Date.now() - started;
    serverLogger[durationMs >= 1000 ? "warning" : "debug"]({
      logId: "mission-storage",
      logValue: "Automerge storage range loaded",
      documentId: keyPrefix[0],
      chunkType: keyPrefix[1],
      allDocuments: keyPrefix.length === 0,
      chunks: result.rows.length,
      durationMs,
      bytes: result.rows.reduce((sum, row) => sum + row.value.byteLength, 0),
    });
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
