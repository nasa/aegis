import { ClientHistoryStore } from "historyStore/ClientHistoryStore";
import { documentReducer } from "historyStore/documentReducer";
import { pendingToConfirmed } from "historyStore/util";
import { confirmedPatch, makeTestDoc, patchAction, type TestDoc } from "./historyTestHelpers";

const makeStore = (initial: TestDoc = makeTestDoc(), actionCount = 1) => {
  const onStateChange = vi.fn();
  const sendActionsToServer = vi.fn();
  const fetchActionsFrom = vi.fn();
  const store = new ClientHistoryStore<TestDoc>({
    rootReducer: documentReducer as (s: TestDoc, a: BaseHistoryAction) => TestDoc,
    onStateChange,
    userId: "vitest-user",
    confirmedState: initial,
    actionCount,
  });
  store.setTransport({ sendActionsToServer, fetchActionsFrom });
  return { store, onStateChange, sendActionsToServer, fetchActionsFrom };
};

/** Add an optimistic edit made against the store's current pending state. */
const addEdit = (store: ClientHistoryStore<TestDoc>, fn: (d: TestDoc) => void) => {
  const res = store.addPending(patchAction(store.getPendingState(), fn).action);
  if (res instanceof Error) throw res;
  return res;
};

describe("ClientHistoryStore", () => {
  it("starts from the hydrated state and count", () => {
    const initial = makeTestDoc();
    const { store } = makeStore(initial, 7);
    expect(store.getConfirmedState()).toEqual(initial);
    expect(store.getPendingState()).toBe(store.getConfirmedState());
    expect(store.getConfirmedCount()).toBe(7);
    expect(Object.isFrozen(store.getConfirmedState().stations)).toBe(true);
  });

  it("applies addPending optimistically, notifies, and sends to the server", () => {
    const { store, onStateChange, sendActionsToServer } = makeStore();
    const action = addEdit(store, (d) => {
      d.stations.a.name = "A2";
    });
    expect(action.historyIndex).toBe(false);
    expect(action.userId).toBe("vitest-user");
    expect(typeof action.meta?.unixtime).toBe("number");
    expect(store.getPendingState().stations.a.name).toBe("A2");
    expect(store.getConfirmedState().stations.a.name).toBe("A");
    expect(store.getPendingActions()).toEqual([action]);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(store.getPendingState(), action.payload.patches);
    expect(sendActionsToServer).toHaveBeenCalledWith([action]);
  });

  it("uses a supplied nextState instead of reducing", () => {
    const { store } = makeStore();
    const { action, next } = patchAction(store.getPendingState(), (d) => {
      d.name = "renamed";
    });
    store.addPending(action, next);
    expect(store.getPendingState()).toBe(next);
  });

  it("returns an Error and changes nothing when addPending fails to reduce", () => {
    const { store, onStateChange, sendActionsToServer } = makeStore();
    const before = store.getPendingState();
    const res = store.addPending({ type: "not-a-real-action" });
    expect(res).toBeInstanceOf(Error);
    expect(store.getPendingState()).toBe(before);
    expect(store.getPendingActions()).toEqual([]);
    expect(onStateChange).not.toHaveBeenCalled();
    expect(sendActionsToServer).not.toHaveBeenCalled();
  });

  it("confirms its own actions in order without another state change", () => {
    const { store, onStateChange } = makeStore();
    const a1 = addEdit(store, (d) => {
      d.stations.a.name = "A2";
    });
    const a2 = addEdit(store, (d) => {
      d.order.push("c");
    });
    const pendingState = store.getPendingState();
    onStateChange.mockClear();

    expect(
      store.addConfirmed([pendingToConfirmed(a1, 1), pendingToConfirmed(a2, 2)])
    ).toBeUndefined();
    expect(store.getPendingActions()).toEqual([]);
    expect(store.getConfirmedCount()).toBe(3);
    expect(store.getConfirmedState()).toBe(pendingState);
    expect(store.getPendingState()).toBe(pendingState);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("confirms a prefix of its own actions and keeps the rest pending", () => {
    const { store } = makeStore();
    const a1 = addEdit(store, (d) => {
      d.stations.a.name = "A2";
    });
    const a2 = addEdit(store, (d) => {
      d.stations.b.name = "B2";
    });
    store.addConfirmed([pendingToConfirmed(a1, 1)]);
    expect(store.getPendingActions().map((a) => a.historyId)).toEqual([a2.historyId]);
    expect(store.getConfirmedState().stations.a.name).toBe("A2");
    expect(store.getConfirmedState().stations.b.name).toBe("B");
    expect(store.getPendingState().stations.b.name).toBe("B2");
  });

  it("applies foreign confirmations directly when nothing is pending", () => {
    const { store, onStateChange } = makeStore();
    const foreign = confirmedPatch(
      store.getConfirmedState(),
      (d) => {
        d.name = "foreign";
      },
      1
    );
    store.addConfirmed([foreign]);
    expect(store.getPendingState().name).toBe("foreign");
    expect(store.getPendingState()).toBe(store.getConfirmedState());
    expect(onStateChange).toHaveBeenCalledWith(store.getPendingState(), foreign.payload.patches);
  });

  it("rebases pending actions over interleaved foreign confirmations", () => {
    const { store, onStateChange } = makeStore();
    const base = store.getConfirmedState();
    const own = addEdit(store, (d) => {
      d.stations.a.name = "mine";
    });
    const foreign = confirmedPatch(
      base,
      (d) => {
        d.stations.b.name = "theirs";
      },
      1
    );
    onStateChange.mockClear();

    store.addConfirmed([foreign]);
    expect(store.getConfirmedState().stations.a.name).toBe("A");
    expect(store.getConfirmedState().stations.b.name).toBe("theirs");
    expect(store.getPendingState().stations.a.name).toBe("mine");
    expect(store.getPendingState().stations.b.name).toBe("theirs");
    expect(store.getPendingActions()).toEqual([own]);
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith(store.getPendingState(), foreign.payload.patches);

    store.addConfirmed([pendingToConfirmed(own, 2)]);
    expect(store.getPendingActions()).toEqual([]);
    expect(store.getConfirmedState()).toEqual(store.getPendingState());
    expect(store.getConfirmedState().stations.a.name).toBe("mine");
    expect(store.getConfirmedCount()).toBe(3);
  });

  it("handles a batch mixing foreign and own confirmations", () => {
    const { store } = makeStore();
    const base = store.getConfirmedState();
    const own1 = addEdit(store, (d) => {
      d.stations.a.name = "mine";
    });
    const own2 = addEdit(store, (d) => {
      d.name = "mine too";
    });
    const foreign = confirmedPatch(
      base,
      (d) => {
        d.stations.b.name = "theirs";
      },
      2
    );
    store.addConfirmed([pendingToConfirmed(own1, 1), foreign]);
    expect(store.getPendingActions()).toEqual([own2]);
    expect(store.getPendingState()).toMatchObject({
      name: "mine too",
      stations: { a: { name: "mine" }, b: { name: "theirs" } },
    });
  });

  it("drops pending actions that no longer apply after a foreign confirmation", () => {
    const { store } = makeStore();
    const base = store.getConfirmedState();
    addEdit(store, (d) => {
      d.stations.a.name = "edited";
    });
    const foreignDelete = confirmedPatch(
      base,
      (d) => {
        delete d.stations.a;
      },
      1
    );
    store.addConfirmed([foreignDelete]);
    expect(store.getPendingActions()).toEqual([]);
    expect(store.getPendingState()).toEqual(store.getConfirmedState());
    expect(store.getPendingState().stations.a).toBeUndefined();
  });

  it("buffers out-of-order confirmations and fetches the gap", () => {
    const { store, fetchActionsFrom, onStateChange } = makeStore();
    const s0 = store.getConfirmedState();
    const c1 = confirmedPatch(
      s0,
      (d) => {
        d.name = "one";
      },
      1
    );
    const s1 = documentReducer(s0, c1);
    const c2 = confirmedPatch(
      s1,
      (d) => {
        d.stations.a.name = "two";
      },
      2
    );
    const s2 = documentReducer(s1, c2);
    const c3 = confirmedPatch(
      s2,
      (d) => {
        d.order.push("three");
      },
      3
    );

    expect(store.addConfirmed([c3])).toBeUndefined();
    expect(fetchActionsFrom).toHaveBeenCalledWith(1);
    expect(store.getConfirmedCount()).toBe(1);
    expect(store.getConfirmedState()).toBe(s0);
    expect(onStateChange).not.toHaveBeenCalled();

    fetchActionsFrom.mockClear();
    store.addConfirmed([c1, c2]);
    expect(fetchActionsFrom).not.toHaveBeenCalled();
    expect(store.getConfirmedCount()).toBe(4);
    expect(store.getConfirmedState()).toMatchObject({
      name: "one",
      stations: { a: { name: "two" } },
      order: ["a", "b", "three"],
    });
  });

  it("ignores a confirmation it already reduced", () => {
    const { store, onStateChange } = makeStore();
    const c1 = confirmedPatch(
      store.getConfirmedState(),
      (d) => {
        d.name = "one";
      },
      1
    );
    store.addConfirmed([c1]);
    const state = store.getConfirmedState();
    onStateChange.mockClear();
    store.addConfirmed([c1]);
    expect(store.getConfirmedState()).toBe(state);
    expect(store.getConfirmedCount()).toBe(2);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("returns an Error when a confirmed action fails to reduce", () => {
    const { store } = makeStore();
    const bad: ConfirmedHistoryAction = {
      type: "document/patch",
      payload: { patches: [{ op: "replace", path: ["stations", "missing", "name"], value: 1 }] },
      historyId: "bad",
      historyIndex: 1,
      userId: "other",
    };
    const res = store.addConfirmed([bad]);
    expect(res).toBeInstanceOf(Error);
    expect(res?.message).toContain("bad");
    expect(store.getConfirmedCount()).toBe(1);
  });

  it("rolls back rejected pending actions", () => {
    const { store, onStateChange } = makeStore();
    const a1 = addEdit(store, (d) => {
      d.stations.a.name = "rejected";
    });
    addEdit(store, (d) => {
      d.stations.b.name = "kept";
    });
    onStateChange.mockClear();

    store.rejectPending([a1.historyId]);
    expect(store.getPendingActions()).toHaveLength(1);
    expect(store.getPendingState().stations.a.name).toBe("A");
    expect(store.getPendingState().stations.b.name).toBe("kept");
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it("does nothing when rejecting an id that is not pending", () => {
    const { store, onStateChange } = makeStore();
    addEdit(store, (d) => {
      d.name = "x";
    });
    const state = store.getPendingState();
    onStateChange.mockClear();
    store.rejectPending(["unknown"]);
    expect(store.getPendingState()).toBe(state);
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("resetFromLatestState keeps and re-applies pending actions", () => {
    const { store, onStateChange, fetchActionsFrom } = makeStore();
    const own = addEdit(store, (d) => {
      d.stations.a.name = "mine";
    });
    // Leave a buffered action behind; the reset must discard it.
    store.addConfirmed([
      confirmedPatch(
        store.getConfirmedState(),
        (d) => {
          d.name = "stale";
        },
        5
      ),
    ]);
    expect(fetchActionsFrom).toHaveBeenCalledWith(1);
    onStateChange.mockClear();

    const latest = { ...makeTestDoc(), name: "server latest" };
    store.resetFromLatestState(latest, 10);
    expect(store.getConfirmedCount()).toBe(10);
    expect(store.getConfirmedState()).toEqual(latest);
    expect(store.getPendingActions()).toEqual([own]);
    expect(store.getPendingState().name).toBe("server latest");
    expect(store.getPendingState().stations.a.name).toBe("mine");
    expect(onStateChange).toHaveBeenCalledTimes(1);

    store.addConfirmed([pendingToConfirmed(own, 10)]);
    expect(store.getPendingActions()).toEqual([]);
    expect(store.getConfirmedCount()).toBe(11);
  });

  it("resendPending sends every pending action", () => {
    const { store, sendActionsToServer } = makeStore();
    const a1 = addEdit(store, (d) => {
      d.name = "1";
    });
    const a2 = addEdit(store, (d) => {
      d.name = "2";
    });
    sendActionsToServer.mockClear();
    store.resendPending();
    expect(sendActionsToServer).toHaveBeenCalledWith([a1, a2]);
  });

  it("re-sends old pending actions after a debounce", () => {
    vi.useFakeTimers();
    try {
      const { store, sendActionsToServer } = makeStore();
      const a1 = addEdit(store, (d) => {
        d.name = "1";
      });
      sendActionsToServer.mockClear();
      vi.advanceTimersByTime(4000);
      store.checkForOldPendingActions();
      vi.advanceTimersByTime(1500);
      expect(sendActionsToServer).toHaveBeenCalledWith([a1]);
    } finally {
      vi.useRealTimers();
    }
  });
});
