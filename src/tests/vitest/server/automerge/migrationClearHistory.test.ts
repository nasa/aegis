// @vitest-environment node
import * as Automerge from "@automerge/automerge";
import { isValidAutomergeUrl, Repo } from "@automerge/automerge-repo/slim";
import type { DocHandle } from "@automerge/automerge-repo/slim";
import type { MikroORM } from "@mikro-orm/postgresql";
import pg from "pg";
import { PostgresStorageAdapter } from "server/automerge/automerge-storage-adapter-postgres";
import { AUTOMERGE_MIGRATIONS } from "server/automerge/migrations";
import { Migration20261015000000 } from "server/automerge/migrations/Migration20261015000000";
import { Migration20261028000000 } from "server/automerge/migrations/Migration20261028000000";
import { globalValues } from "server/express/global";
import { generateBlankFolder } from "store/storeUtils/folder";
import { generateBlankMission } from "store/storeUtils/mission";

describe("clear Automerge document history", () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let storage: PostgresStorageAdapter;
  let repos: Repo[];
  const originalRepo = globalValues.automergeRepo;

  beforeAll(async () => {
    pool = new pg.Pool({
      user: "postgres",
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASS,
      port: 5432,
    });
    client = await pool.connect();
    // Temporary tables shadow the application tables only on this connection. Both the
    // storage adapter and replacement transaction use it, leaving application data alone.
    await client.query(`create temporary table "doc_listing_db" (
      "mission_id" integer primary key, "automerge_url" text not null,
      "version" integer not null default 1
    )`);
    await client.query(`create temporary table "automerge_native_db" (
      "key" bytea[] primary key, "value" bytea not null
    )`);
    storage = new PostgresStorageAdapter("automerge_native_db", {
      query: (sql: string, values: unknown[]) => client.query(sql, values),
    } as unknown as pg.Pool);
  });

  beforeEach(async () => {
    repos = [];
    await client.query('truncate "doc_listing_db", "automerge_native_db"');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const repo of repos) await repo.shutdown();
    // Let the Repo's throttled saves settle before clearing the temporary tables.
    await new Promise((resolve) => setTimeout(resolve, 20));
    globalValues.automergeRepo = originalRepo;
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  const makeRepo = () => {
    const repo = new Repo({ storage, saveDebounceRate: 0 });
    repos.push(repo);
    return repo;
  };

  const makeDocument = async (repo: Repo, missionId = 42) => {
    const handle = repo.create<Mission>(
      generateBlankMission({
        id: missionId,
        name: "Original mission",
        description: "Discarded historical content",
        folders: { folder: generateBlankFolder({ uuid: "folder", items: ["item"] }) },
      })
    );
    handle.change((mission) => {
      mission.name = "Current mission";
      mission.description = "";
      mission.folders.folder.visible = false;
    });
    handle.change((mission) => {
      mission.folders.folder.items.push("second-item");
    });
    await repo.flush();
    await storage.save([handle.documentId, "sync-state", "peer"], new Uint8Array([1]));
    const listing = { missionId, automergeUrl: handle.url };
    await client.query(
      'insert into "doc_listing_db" ("mission_id", "automerge_url", "version") values ($1, $2, 7)',
      [missionId, handle.url]
    );
    return { handle, listing };
  };

  const migrate = async (
    repo: Repo,
    handle: DocHandle<Mission>,
    listing: AutomergeDocListing,
    migrationClient = client
  ) => {
    globalValues.automergeRepo = repo;
    // Supply the dedicated temporary-table connection through the ORM's native pool API.
    const orm = {
      em: {
        fork: () => ({
          getConnection: () => ({
            getNativeClient: async () => ({
              connect: async () => ({
                query: (sql: string, values?: unknown[]) => migrationClient.query(sql, values),
                release: vi.fn(),
              }),
            }),
          }),
        }),
      },
    } as unknown as MikroORM;
    await Migration20261028000000.migrate(handle, {
      docListing: listing,
      orm,
    });
    if (!isValidAutomergeUrl(listing.automergeUrl)) throw new Error("Invalid migrated URL");
    return repo.find<Mission>(listing.automergeUrl);
  };

  it("is registered after the existing document migrations", () => {
    expect(AUTOMERGE_MIGRATIONS.at(-1)).toBe(Migration20261028000000);
  });

  it("ordinary migrations preserve the document ID", async () => {
    const repo = makeRepo();
    const { handle, listing } = await makeDocument(repo);
    const oldUrl = handle.url;
    handle.change((mission) => {
      Object.assign(mission.folders.folder, { missionId: listing.missionId });
    });

    const result = await Migration20261015000000.migrate(handle, {
      docListing: listing,
      orm: null,
    });
    await repo.flush();

    expect(result).toBeUndefined();
    expect(handle.doc().folders.folder).not.toHaveProperty("missionId");
    expect(handle.url).toBe(oldUrl);
    expect(listing.automergeUrl).toBe(oldUrl);
    expect((await storage.loadRange([handle.documentId])).length).toBeGreaterThan(0);
    expect(
      (await client.query('select * from "doc_listing_db" where "mission_id" = 42')).rows
    ).toEqual([{ mission_id: 42, automerge_url: oldUrl, version: 7 }]);
  });

  it("preserves current content, reloads with one change, and deletes only the old ID's rows", async () => {
    const repo = makeRepo();
    const { handle, listing } = await makeDocument(repo);
    const other = await makeDocument(repo, 43);
    const oldUrl = handle.url;
    const oldHistory = Automerge.topoHistoryTraversal(handle.doc());
    const expected = Automerge.toJS(handle.doc());
    expect(oldHistory).toHaveLength(3);

    const replacement = await migrate(repo, handle, listing);
    expect(replacement.url).not.toBe(oldUrl);
    expect(listing.automergeUrl).toBe(replacement.url);
    expect(repo.handles[handle.documentId]).toBeUndefined();
    expect(await storage.loadRange([handle.documentId])).toEqual([]);
    expect((await storage.loadRange([other.handle.documentId])).length).toBeGreaterThan(0);
    expect(
      (await client.query('select * from "doc_listing_db" where "mission_id" = 42')).rows
    ).toEqual([{ mission_id: 42, automerge_url: replacement.url, version: 8 }]);

    const reloadedRepo = makeRepo();
    const reloaded = await reloadedRepo.find<Mission>(replacement.url);
    expect(Automerge.toJS(reloaded.doc())).toEqual(expected);
    expect(Automerge.getHistory(reloaded.doc())).toHaveLength(1);
    expect(
      Automerge.topoHistoryTraversal(reloaded.doc()).some((head) => oldHistory.includes(head))
    ).toBe(false);
    reloaded.change((mission) => {
      mission.description = "New edit";
    });
    await reloadedRepo.flush();
    expect((await makeRepo().find<Mission>(replacement.url)).doc().description).toBe("New edit");

    // Neither pending save timers nor shutdown may recreate the deleted document.
    await repo.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await storage.loadRange([handle.documentId])).toEqual([]);
  });

  it("can repeat a committed document after an interrupted migration run", async () => {
    const repo = makeRepo();
    const { handle, listing } = await makeDocument(repo);
    const first = await migrate(repo, handle, listing);
    const restartedRepo = makeRepo();
    const reloaded = await restartedRepo.find<Mission>(first.url);
    const expected = Automerge.toJS(reloaded.doc());
    const second = await migrate(restartedRepo, reloaded, listing);

    expect(Automerge.toJS(second.doc())).toEqual(expected);
    expect(Automerge.getHistory(second.doc())).toHaveLength(1);
    expect(await storage.loadRange([handle.documentId])).toEqual([]);
    expect(await storage.loadRange([first.documentId])).toEqual([]);
    expect(listing.automergeUrl).toBe(second.url);
  });

  it("rolls back the listing switch when deleting the old storage fails", async () => {
    const repo = makeRepo();
    const { handle, listing } = await makeDocument(repo);
    const oldUrl = handle.url;
    const expected = Automerge.toJS(handle.doc());
    const failingClient = {
      query: (sql: string, values?: unknown[]) =>
        sql.startsWith('delete from "automerge_native_db"')
          ? client.query("select 1 / 0")
          : client.query(sql, values),
    } as pg.PoolClient;

    await expect(migrate(repo, handle, listing, failingClient)).rejects.toThrow(/division by zero/);

    expect(listing.automergeUrl).toBe(oldUrl);
    expect(
      (await client.query('select * from "doc_listing_db" where "mission_id" = 42')).rows
    ).toEqual([{ mission_id: 42, automerge_url: oldUrl, version: 7 }]);
    expect((await storage.loadRange([handle.documentId])).length).toBeGreaterThan(0);
    expect(Automerge.toJS((await makeRepo().find<Mission>(oldUrl)).doc())).toEqual(expected);
  });

  it("keeps the old listing and history when saving the replacement fails", async () => {
    const repo = makeRepo();
    const { handle, listing } = await makeDocument(repo);
    vi.spyOn(repo, "flush").mockRejectedValueOnce(new Error("Storage unavailable"));

    await expect(migrate(repo, handle, listing)).rejects.toThrow("Storage unavailable");

    expect(listing.automergeUrl).toBe(handle.url);
    expect((await storage.loadRange([handle.documentId])).length).toBeGreaterThan(0);
    expect(repo.handles[handle.documentId]).toBe(handle);
  });
});
