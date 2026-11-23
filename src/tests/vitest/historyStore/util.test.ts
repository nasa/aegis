import {
  deepFreeze,
  filterByIds,
  isValidDocumentId,
  prepareActionsForConfirmation,
  PromiseQueue,
  reduceManyActions,
} from "historyStore/util";

const confirmed = (
  historyIndex: number,
  historyId = `id-${historyIndex}`
): ConfirmedHistoryAction => ({
  type: "test",
  historyId,
  historyIndex,
  userId: "vitest-user",
});

const indices = (actions: ConfirmedHistoryAction[]) => actions.map((a) => a.historyIndex);

describe("prepareActionsForConfirmation", () => {
  it("readies contiguous actions starting at nextIndex", () => {
    const res = prepareActionsForConfirmation(3, [], [confirmed(3), confirmed(4)]);
    expect(indices(res.readyActions)).toEqual([3, 4]);
    expect(res.newBuffer).toEqual([]);
    expect(res.neededIndices).toEqual([]);
  });

  it("sorts unordered input", () => {
    const res = prepareActionsForConfirmation(3, [], [confirmed(5), confirmed(3), confirmed(4)]);
    expect(indices(res.readyActions)).toEqual([3, 4, 5]);
  });

  it("buffers actions after a gap and lists every missing index", () => {
    const res = prepareActionsForConfirmation(3, [], [confirmed(5), confirmed(7)]);
    expect(res.readyActions).toEqual([]);
    expect(indices(res.newBuffer)).toEqual([5, 7]);
    expect(res.neededIndices).toEqual([3, 4, 6]);
  });

  it("readies the contiguous prefix and buffers the rest", () => {
    const res = prepareActionsForConfirmation(3, [], [confirmed(3), confirmed(5)]);
    expect(indices(res.readyActions)).toEqual([3]);
    expect(indices(res.newBuffer)).toEqual([5]);
    expect(res.neededIndices).toEqual([4]);
  });

  it("releases buffered actions once the gap fills", () => {
    const res = prepareActionsForConfirmation(
      3,
      [confirmed(5), confirmed(6)],
      [confirmed(3), confirmed(4)]
    );
    expect(indices(res.readyActions)).toEqual([3, 4, 5, 6]);
    expect(res.newBuffer).toEqual([]);
    expect(res.neededIndices).toEqual([]);
  });

  it("drops actions already reduced (index below nextIndex)", () => {
    const res = prepareActionsForConfirmation(3, [confirmed(1)], [confirmed(2), confirmed(3)]);
    expect(indices(res.readyActions)).toEqual([3]);
    expect(res.newBuffer).toEqual([]);
  });

  it("deduplicates by historyId across buffer and new actions", () => {
    const res = prepareActionsForConfirmation(3, [confirmed(4)], [confirmed(4), confirmed(3)]);
    expect(indices(res.readyActions)).toEqual([3, 4]);
  });

  it("returns nothing for empty input", () => {
    expect(prepareActionsForConfirmation(0, [], [])).toEqual({
      newBuffer: [],
      readyActions: [],
      neededIndices: [],
    });
  });
});

describe("reduceManyActions", () => {
  type S = { value: number };
  const reducer = (state: S, action: BaseHistoryAction): S => {
    if (action.type === "add") return { value: state.value + (action.payload as number) };
    throw new Error(`bad action ${action.type}`);
  };
  const act = (type: string, payload: number, historyId: string): PendingHistoryAction => ({
    type,
    payload,
    historyId,
    historyIndex: false,
    userId: "vitest-user",
  });

  it("reduces every action in order", () => {
    const actions = [act("add", 1, "a"), act("add", 2, "b")];
    const res = reduceManyActions({ value: 0 }, reducer, actions);
    expect(res.newState).toEqual({ value: 3 });
    expect(res.error).toBeUndefined();
    expect(res.completeActions).toEqual(actions);
    expect(res.incompleteActions).toEqual([]);
  });

  it("stops at the first error and returns it and every later action as incomplete", () => {
    const actions = [act("add", 1, "a"), act("boom", 0, "b"), act("add", 5, "c")];
    const res = reduceManyActions({ value: 0 }, reducer, actions);
    expect(res.newState).toEqual({ value: 1 });
    expect(res.error?.message).toBe("bad action boom");
    expect(res.error?.cause).toBe("reduceManyActions errored during action boom|b");
    expect(res.completeActions.map((a) => a.historyId)).toEqual(["a"]);
    expect(res.incompleteActions.map((a) => a.historyId)).toEqual(["b", "c"]);
  });

  it("wraps non-Error throws", () => {
    const res = reduceManyActions(
      0,
      () => {
        // eslint-disable-next-line no-throw-literal
        throw "string failure";
      },
      [act("x", 0, "a")]
    );
    expect(res.error).toBeInstanceOf(Error);
    expect(res.error?.message).toBe("string failure");
  });

  it("returns the initial state for no actions", () => {
    const initial = { value: 4 };
    expect(reduceManyActions(initial, reducer, []).newState).toBe(initial);
  });
});

describe("small helpers", () => {
  it("deepFreeze freezes nested objects and arrays", () => {
    const obj = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(obj.a)).toBe(true);
    expect(Object.isFrozen(obj.a.b)).toBe(true);
    expect(Object.isFrozen(obj.a.b[1])).toBe(true);
  });

  it("filterByIds keeps matches or non-matches", () => {
    const arr = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(filterByIds(arr, "id", ["b"], "matches")).toEqual([{ id: "b" }]);
    expect(filterByIds(arr, "id", ["b"], "nonmatches")).toEqual([{ id: "a" }, { id: "c" }]);
  });

  it("PromiseQueue runs work serially even when it throws", async () => {
    const queue = new PromiseQueue();
    const order: string[] = [];
    const slow = queue.push(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("slow");
    });
    const failing = queue.push(() => {
      order.push("failing");
      throw new Error("fail");
    });
    const fast = queue.push(() => order.push("fast"));
    await slow;
    await expect(failing).rejects.toThrow("fail");
    await fast;
    expect(order).toEqual(["slow", "failing", "fast"]);
  });

  it("isValidDocumentId accepts non-empty strings only", () => {
    expect(isValidDocumentId("automerge:abc")).toBe(true);
    expect(isValidDocumentId("history:123")).toBe(true);
    expect(isValidDocumentId("")).toBe(false);
    expect(isValidDocumentId(undefined)).toBe(false);
    expect(isValidDocumentId(5)).toBe(false);
  });
});
