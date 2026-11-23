// @vitest-environment node
import { v4 as uuidv4 } from "uuid";
import { DOCUMENT_INIT } from "historyStore/documentReducer";
import { SNAPSHOT_INTERVAL, ServerHistoryStore } from "server/historyStore/ServerHistoryStore";
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

const newStore = () => new ServerHistoryStore<TestDoc>(db.persistence);

const counterAction = (n: number): PendingHistoryAction => ({
  type: "document/patch",
  payload: { patches: [{ op: "replace", path: ["name"], value: `edit ${n}` }] },
  historyId: uuidv4(),
  historyIndex: false,
  userId: "vitest-user",
});

const failingAction = (): PendingHistoryAction => ({
  type: "document/patch",
  payload: { patches: [{ op: "replace", path: ["stations", "missing", "name"], value: "x" }] },
  historyId: uuidv4(),
  historyIndex: false,
  userId: "vitest-user",
});

const startedStore = async () => {
  const store = newStore();
  const documentId = db.newDocumentId();
  const init = await store.startEvent(documentId, makeTestDoc(), "vitest-user");
  return { store, documentId, init };
};

describe("ServerHistoryStore", () => {
  it("startEvent persists row 0 with the initial state", async () => {
    const { store, documentId, init } = await startedStore();
    expect(init).toMatchObject({ type: DOCUMENT_INIT, historyIndex: 0, userId: "vitest-user" });
    expect(store.isLoaded(documentId)).toBe(true);
    expect(store.getLatestStateAndActionNum(documentId)).toEqual({
      state: makeTestDoc(),
      actionCount: 1,
    });
    const rows = await db.rowsOf(documentId);
    expect(rows).toHaveLength(1);
    expect(rows[0].action.historyId).toBe(init.historyId);
    expect(rows[0].state_prior_to_action).toEqual(makeTestDoc());
    expect(await db.persistence.documentExists(documentId)).toBe(true);
  });

  it("startEvent rejects an existing document id, loaded or not", async () => {
    const { store, documentId } = await startedStore();
    await expect(store.startEvent(documentId, makeTestDoc(), "u")).rejects.toThrow(
      "already exists"
    );
    await expect(newStore().startEvent(documentId, makeTestDoc(), "u")).rejects.toThrow(
      "already exists"
    );
  });

  it("sequences, persists, and publishes inserted actions", async () => {
    const { store, documentId } = await startedStore();
    const published = vi.fn();
    store.subscribe(published);
    const a1 = pendingPatch(makeTestDoc(), (d) => {
      d.stations.a.name = "A2";
    });
    const a2 = pendingPatch(makeTestDoc(), (d) => {
      d.order.push("c");
    });

    const res = await store.insert(documentId, [a1, a2]);
    expect(res.rejected).toEqual([]);
    expect(res.confirmed.map((a) => [a.historyId, a.historyIndex])).toEqual([
      [a1.historyId, 1],
      [a2.historyId, 2],
    ]);
    const state = store.getConfirmedState(documentId)!;
    expect(state.stations.a.name).toBe("A2");
    expect(state.order).toEqual(["a", "b", "c"]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(store.getLatestStateAndActionNum(documentId)).toMatchObject({ actionCount: 3 });
    expect(published).toHaveBeenCalledWith({
      documentId,
      confirmed: res.confirmed,
      confirmedState: state,
    });

    const rows = await db.rowsOf(documentId);
    expect(rows.map((r) => r.history_index)).toEqual([0, 1, 2]);
    expect(rows[1].action).toEqual(res.confirmed[0]);
    expect(rows[1].state_prior_to_action).toBeNull();
  });

  it("rejects duplicate historyIds, across and within batches", async () => {
    const { store, documentId } = await startedStore();
    const a1 = counterAction(1);
    await store.insert(documentId, [a1]);
    const a2 = counterAction(2);
    const res = await store.insert(documentId, [a1, a2, a2]);
    expect(res.rejected).toEqual([a1.historyId, a2.historyId]);
    expect(res.confirmed.map((a) => a.historyIndex)).toEqual([2]);
    expect((await db.rowsOf(documentId)).length).toBe(3);
  });

  it("does not persist or publish when every action is a duplicate", async () => {
    const { store, documentId } = await startedStore();
    const a1 = counterAction(1);
    await store.insert(documentId, [a1]);
    const published = vi.fn();
    store.subscribe(published);
    expect(await store.insert(documentId, [a1])).toEqual({
      confirmed: [],
      rejected: [a1.historyId],
    });
    expect(published).not.toHaveBeenCalled();
  });

  it("rejects an action that fails the reducer and every later action in the batch", async () => {
    const { store, documentId } = await startedStore();
    const good = counterAction(1);
    const bad = failingAction();
    const after = counterAction(2);
    const res = await store.insert(documentId, [good, bad, after]);
    expect(res.confirmed.map((a) => a.historyId)).toEqual([good.historyId]);
    expect(res.rejected).toEqual([bad.historyId, after.historyId]);
    expect(store.getConfirmedState(documentId)!.name).toBe("edit 1");

    const onlyBad = await store.insert(documentId, [failingAction()]);
    expect(onlyBad.confirmed).toEqual([]);
    expect(onlyBad.rejected).toHaveLength(1);
    expect((await db.rowsOf(documentId)).length).toBe(2);
  });

  it("rejects inserts into a document that is not loaded", async () => {
    const store = newStore();
    const a = counterAction(1);
    const res = await store.insert("vitest-history:not-loaded", [a]);
    expect(res.rejected).toEqual([a.historyId]);
    expect(res.error?.message).toBe("Document not loaded");
    expect(store.getLatestStateAndActionNum("vitest-history:not-loaded")).toBeInstanceOf(Error);
  });

  it("returns an error when loading a document that does not exist", async () => {
    const err = await newStore().load(db.newDocumentId());
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain("not found");
  });

  it("serializes concurrent inserts with unique, contiguous indices", async () => {
    const { store, documentId } = await startedStore();
    const actions = Array.from({ length: 25 }, (_, i) => counterAction(i));
    const results = await Promise.all(actions.map((a) => store.insert(documentId, [a])));
    const indices = results.flatMap((r) => r.confirmed.map((a) => a.historyIndex));
    expect([...indices].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    // Queue order is call order.
    expect(indices).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect(store.getConfirmedState(documentId)!.name).toBe("edit 24");
    expect((await db.rowsOf(documentId)).map((r) => r.history_index)).toEqual(
      Array.from({ length: 26 }, (_, i) => i)
    );
  });

  it("getActionsSince returns confirmed actions from an index, after queued inserts", async () => {
    const { store, documentId, init } = await startedStore();
    const first = await store.insert(documentId, [counterAction(1), counterAction(2)]);
    const pending = store.insert(documentId, [counterAction(3)]);
    const since = await store.getActionsSince(documentId, 2);
    const third = await pending;
    expect(since).toEqual([first.confirmed[1], third.confirmed[0]]);
    expect((await store.getActionsSince(documentId, 0))[0]).toEqual(init);
    expect(await store.getActionsSince(documentId, 99)).toEqual([]);
  });

  it("unload then load restores the same state and keeps sequencing", async () => {
    const { store, documentId } = await startedStore();
    await store.insert(documentId, [
      pendingPatch(makeTestDoc(), (d) => {
        delete d.stations.b;
        d.stations.a.coordinates!.push([5, 5]);
      }),
    ]);
    const before = store.getConfirmedState(documentId);
    await store.unload(documentId);
    expect(store.isLoaded(documentId)).toBe(false);
    expect(await store.load(documentId)).toBeUndefined();
    expect(store.getConfirmedState(documentId)).toEqual(before);

    const dup = await store.insert(documentId, [
      { ...counterAction(0), historyId: (await store.getActionsSince(documentId, 1))[0].historyId },
    ]);
    expect(dup.rejected).toHaveLength(1);
    const next = await store.insert(documentId, [counterAction(9)]);
    expect(next.confirmed[0].historyIndex).toBe(2);
  });

  it("shares one load between concurrent load() calls", async () => {
    const { documentId } = await startedStore();
    const store = newStore();
    const spy = vi.spyOn(db.persistence, "selectHistoryIds");
    try {
      const [r1, r2] = await Promise.all([store.load(documentId), store.load(documentId)]);
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it(`saves a snapshot every ${SNAPSHOT_INTERVAL} actions and resumes loads from it`, async () => {
    const { store, documentId } = await startedStore();
    const total = SNAPSHOT_INTERVAL + 5;
    let stateBeforeSnapshotAction: TestDoc | undefined;
    for (let i = 1; i < total; i++) {
      if (i === SNAPSHOT_INTERVAL) stateBeforeSnapshotAction = store.getConfirmedState(documentId);
      const res = await store.insert(documentId, [counterAction(i)]);
      expect(res.confirmed[0].historyIndex).toBe(i);
    }
    expect(await db.persistence.selectSnapshotIndices(documentId)).toEqual([SNAPSHOT_INTERVAL, 0]);
    expect(await db.persistence.selectSnapshot(documentId, SNAPSHOT_INTERVAL)).toEqual(
      stateBeforeSnapshotAction
    );

    const reloaded = newStore();
    const fromSpy = vi.spyOn(db.persistence, "selectActionsFrom");
    try {
      expect(await reloaded.load(documentId)).toBeUndefined();
      expect(fromSpy).toHaveBeenCalledWith(documentId, SNAPSHOT_INTERVAL);
    } finally {
      fromSpy.mockRestore();
    }
    expect(reloaded.getLatestStateAndActionNum(documentId)).toEqual(
      store.getLatestStateAndActionNum(documentId)
    );
    expect(reloaded.getConfirmedState(documentId)!.name).toBe(`edit ${total - 1}`);
  }, 60000);

  it("stores the snapshot on the first row of a batch that crosses the interval", async () => {
    const { store, documentId } = await startedStore();
    const lead = Array.from({ length: SNAPSHOT_INTERVAL - 3 }, (_, i) => counterAction(i + 1));
    await store.insert(documentId, lead);
    const before = store.getConfirmedState(documentId);
    const crossing = await store.insert(documentId, [
      counterAction(1000),
      counterAction(1001),
      counterAction(1002),
      counterAction(1003),
      counterAction(1004),
    ]);
    const firstIndex = crossing.confirmed[0].historyIndex;
    expect(firstIndex).toBe(SNAPSHOT_INTERVAL - 2);
    expect(await db.persistence.selectSnapshotIndices(documentId)).toEqual([firstIndex, 0]);
    expect(await db.persistence.selectSnapshot(documentId, firstIndex)).toEqual(before);

    const reloaded = newStore();
    await reloaded.load(documentId);
    expect(reloaded.getConfirmedState(documentId)).toEqual(store.getConfirmedState(documentId));
  });

  it("rejects the whole batch and leaves memory unchanged when the database write fails", async () => {
    const { store, documentId } = await startedStore();
    const before = store.getLatestStateAndActionNum(documentId);
    const spy = vi
      .spyOn(db.persistence, "insertActions")
      .mockRejectedValueOnce(new Error("db down"));
    try {
      const a = counterAction(1);
      const res = await store.insert(documentId, [a]);
      expect(res).toMatchObject({ confirmed: [], rejected: [a.historyId] });
      expect(res.error?.message).toBe("db down");
      expect(store.getLatestStateAndActionNum(documentId)).toEqual(before);
      expect(logger.error).toHaveBeenCalled();
      // Retrying the same action succeeds.
      expect((await store.insert(documentId, [a])).confirmed).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("loads a document whose stored history fails to reduce as read-only", async () => {
    const { documentId } = await startedStore();
    await db.persistence.insertActions(
      documentId,
      [{ ...failingAction(), historyIndex: 1 }],
      undefined
    );
    const store = newStore();
    expect(await store.load(documentId)).toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expect(store.getConfirmedState(documentId)).toEqual(makeTestDoc());
    const res = await store.insert(documentId, [counterAction(1)]);
    expect(res.confirmed).toEqual([]);
    expect(res.error?.message).toContain("read-only");
  });

  it("loads a document with a missing history index as read-only", async () => {
    const { documentId } = await startedStore();
    await db.persistence.insertActions(
      documentId,
      [{ ...counterAction(2), historyIndex: 2 }],
      undefined
    );
    const store = newStore();
    expect(await store.load(documentId)).toBeUndefined();
    expect((await store.insert(documentId, [counterAction(3)])).error?.message).toContain(
      "missing"
    );
  });

  it("deleteDocument removes the history from memory and the database", async () => {
    const { store, documentId } = await startedStore();
    await store.insert(documentId, [counterAction(1)]);
    await store.deleteDocument(documentId);
    expect(store.isLoaded(documentId)).toBe(false);
    expect(await db.rowsOf(documentId)).toEqual([]);
    expect(await store.load(documentId)).toBeInstanceOf(Error);
  });
});
