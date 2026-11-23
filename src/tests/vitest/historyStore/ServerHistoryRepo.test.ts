// @vitest-environment node
import { v4 as uuidv4 } from "uuid";
import { ServerHistoryRepo, SERVER_USER_ID } from "server/historyStore/ServerHistoryRepo";
import { ServerHistoryStore } from "server/historyStore/ServerHistoryStore";
import { createTestDb } from "./historyDbHelpers";
import { makeTestDoc, pendingPatch, type TestDoc } from "./historyTestHelpers";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  warning: vi.fn(),
  notice: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("utils/logging/serverLogger", () => ({ serverLogger: logger }));

const db = createTestDb();
afterAll(() => db.cleanup());
beforeEach(() => vi.clearAllMocks());

const newRepo = () => new ServerHistoryRepo(new ServerHistoryStore<unknown>(db.persistence));

/** An action as a browser would send it, made against `base`. */
const browserEdit = (base: TestDoc, fn: (d: TestDoc) => void) =>
  pendingPatch(base, fn, uuidv4(), "vitest-browser-user");

describe("ServerHistoryRepo / ServerDocHandle", () => {
  it("create() returns the initial state at once and is ready once persisted", async () => {
    const repo = newRepo();
    const onDocument = vi.fn();
    repo.on("document", onDocument);
    const documentId = db.newDocumentId();
    const handle = repo.create(makeTestDoc(), documentId);
    expect(handle.documentId).toBe(documentId);
    expect(handle.url).toBe(documentId);
    expect(handle.doc()).toEqual(makeTestDoc());
    expect(repo.handles[documentId]).toBe(handle);
    expect(() =>
      handle.change((d) => {
        d.name = "too early";
      })
    ).toThrow("not ready");
    await handle.whenReady();
    expect(handle.isReady()).toBe(true);
    expect(onDocument).toHaveBeenCalledWith({ handle });
    expect(await db.persistence.documentExists(documentId)).toBe(true);
  });

  it("create() with an existing id rejects whenReady and drops the handle", async () => {
    const documentId = db.newDocumentId();
    await newRepo().create(makeTestDoc(), documentId).whenReady();
    const repo = newRepo();
    const handle = repo.create(makeTestDoc(), documentId);
    await expect(handle.whenReady()).rejects.toThrow("already exists");
    expect(repo.handles[documentId]).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ logId: "history-repo:create:failedToPersistNewDocument" }),
      expect.any(Error)
    );
  });

  it("create() without an id makes a history: id", async () => {
    const repo = newRepo();
    const handle = repo.create(makeTestDoc());
    expect(handle.documentId).toMatch(/^history:[0-9a-f-]{36}$/);
    await handle.whenReady();
    await repo.delete(handle.documentId);
  });

  it("change() is visible synchronously and flush() persists it", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();
    const onChange = vi.fn();
    handle.on("change", onChange);

    const result = handle.change((d) => {
      d.stations.a.name = "server edit";
      return "returned";
    });
    expect(result).toBe("returned");
    expect(handle.doc()!.stations.a.name).toBe("server edit");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].patches).toEqual([
      { op: "replace", path: ["stations", "a", "name"], value: "server edit" },
    ]);
    handle.change((d) => {
      d.order.push("c");
    });

    await handle.flush();
    const rows = await db.rowsOf(documentId);
    expect(rows.map((r) => r.history_index)).toEqual([0, 1, 2]);
    expect(rows[1].action.userId).toBe(SERVER_USER_ID);
    expect(repo.store.getConfirmedState(documentId)).toEqual(handle.doc());

    // Persisted state reloads identically in a fresh repo.
    const other = await newRepo().find<TestDoc>(documentId);
    expect(other.doc()).toEqual(handle.doc());
    expect(other.doc()!.order).toEqual(["a", "b", "c"]);
  });

  // Bug: receiveConfirmed swaps the handle's local state for the store's equal-but-new
  // confirmed state, so every server edit emits "change" twice with the same patches.
  it("emits change once per server edit, not again on its confirmation", async () => {
    const repo = newRepo();
    const handle = repo.create<TestDoc>(makeTestDoc(), db.newDocumentId());
    await handle.whenReady();
    const onChange = vi.fn();
    handle.on("change", onChange);
    handle.change((d) => {
      d.name = "once";
    });
    const local = handle.doc();
    await handle.flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(handle.doc()).toBe(local);
  });

  it("does not submit an action when change() changes nothing", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();
    const onChange = vi.fn();
    handle.on("change", onChange);
    const insertSpy = vi.spyOn(repo.store, "insert");
    expect(handle.change((d) => d.order.length)).toBe(2);
    await handle.flush();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect((await db.rowsOf(documentId)).length).toBe(1);
  });

  it("find() loads an existing document and rejects an unknown one", async () => {
    const documentId = db.newDocumentId();
    await newRepo().create(makeTestDoc(), documentId).whenReady();

    const repo = newRepo();
    const metrics = vi.fn();
    repo.on("doc-metrics", metrics);
    const [h1, h2] = await Promise.all([repo.find(documentId), repo.find(documentId)]);
    expect(h1).toBe(h2);
    expect(h1.doc()).toEqual(makeTestDoc());
    expect(metrics).toHaveBeenCalledWith(
      expect.objectContaining({ type: "doc-loaded", documentId })
    );

    const missing = db.newDocumentId();
    await expect(repo.find(missing)).rejects.toThrow("not found");
    expect(repo.handles[missing]).toBeUndefined();
  });

  it("applies confirmations from another source and emits change", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();
    const saved = vi.fn();
    repo.onDocumentSaved = saved;
    const onChange = vi.fn();
    handle.on("change", onChange);

    const edit = browserEdit(handle.doc()!, (d) => {
      d.stations.b.name = "from browser";
    });
    const res = await repo.store.insert(documentId, [edit]);
    expect(res.confirmed).toHaveLength(1);
    expect(handle.doc()!.stations.b.name).toBe("from browser");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].patches).toEqual(edit.payload.patches);
    expect(saved).toHaveBeenCalledWith(documentId);
  });

  it("keeps a pending server edit on top of an interleaved foreign confirmation", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();

    handle.change((d) => {
      d.stations.a.name = "server";
    });
    // Queued synchronously, so it reaches the store before the handle's own insert.
    const foreign = repo.store.insert(documentId, [
      browserEdit(makeTestDoc(), (d) => {
        d.stations.b.name = "browser";
      }),
    ]);
    expect(handle.doc()!.stations.a.name).toBe("server");
    await foreign;
    expect(handle.doc()!.stations.a.name).toBe("server");
    expect(handle.doc()!.stations.b.name).toBe("browser");
    await handle.flush();
    expect(repo.store.getConfirmedState(documentId)).toEqual(handle.doc());
    expect((await db.rowsOf(documentId)).length).toBe(3);
  });

  it("rolls back a server edit the store rejects", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();
    const onChange = vi.fn();
    handle.on("change", onChange);

    handle.change((d) => {
      d.stations.a.name = "doomed";
    });
    // A browser deletes station a first, so the server edit no longer applies.
    const foreign = repo.store.insert(documentId, [
      browserEdit(makeTestDoc(), (d) => {
        delete d.stations.a;
      }),
    ]);
    expect(handle.doc()!.stations.a.name).toBe("doomed");
    await foreign;
    await handle.flush();

    expect(handle.doc()!.stations.a).toBeUndefined();
    expect(handle.doc()).toEqual(repo.store.getConfirmedState(documentId));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: "history-server-handle:submit:serverEditRejectedByHistoryStore",
      }),
      expect.any(Error)
    );
    expect(onChange.mock.lastCall![0].doc.stations.a).toBeUndefined();
    expect((await db.rowsOf(documentId)).length).toBe(2);
  });

  it("rolls back only the rejected edit and keeps later pending edits", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();
    const realInsert = repo.store.insert.bind(repo.store);
    let calls = 0;
    const spy = vi.spyOn(repo.store, "insert").mockImplementation(async (id, actions) => {
      if (calls++ === 0) return { confirmed: [], rejected: actions.map((a) => a.historyId) };
      return realInsert(id, actions);
    });
    try {
      handle.change((d) => {
        d.name = "rejected";
      });
      handle.change((d) => {
        d.stations.b.name = "kept";
      });
      await handle.flush();
    } finally {
      spy.mockRestore();
    }
    expect(handle.doc()!.name).toBe("mission");
    expect(handle.doc()!.stations.b.name).toBe("kept");
    expect(repo.store.getConfirmedState(documentId)).toEqual(handle.doc());
  });

  it("removeFromCache flushes and unloads; find() reloads", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();
    handle.change((d) => {
      d.name = "cached";
    });
    await repo.removeFromCache(documentId);
    expect(repo.handles[documentId]).toBeUndefined();
    expect(repo.store.isLoaded(documentId)).toBe(false);
    const reloaded = await repo.find<TestDoc>(documentId);
    expect(reloaded).not.toBe(handle);
    expect(reloaded.doc()!.name).toBe("cached");
  });

  it("delete() removes the document and fires delete", async () => {
    const repo = newRepo();
    const documentId = db.newDocumentId();
    const handle = repo.create<TestDoc>(makeTestDoc(), documentId);
    await handle.whenReady();
    const onDelete = vi.fn();
    handle.on("delete", onDelete);
    await repo.delete(documentId);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(handle.isDeleted()).toBe(true);
    expect(handle.isReady()).toBe(false);
    expect(repo.handles[documentId]).toBeUndefined();
    expect(await db.rowsOf(documentId)).toEqual([]);
    expect(() =>
      handle.change((d) => {
        d.name = "x";
      })
    ).toThrow("deleted");
  });
});
