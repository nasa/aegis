import { LocalDocHandle } from "historyStore/LocalDocHandle";
import { makeTestDoc, type TestDoc } from "./historyTestHelpers";

describe("LocalDocHandle", () => {
  it("is ready at once with a frozen copy of the initial state", async () => {
    const initial = makeTestDoc();
    const handle = new LocalDocHandle(initial);
    await expect(handle.whenReady()).resolves.toBeUndefined();
    expect(handle.isReady()).toBe(true);
    expect(handle.documentId).toBe("local:document");
    expect(handle.url).toBe("local:document");
    expect(handle.doc()).toEqual(initial);
    expect(handle.doc()).not.toBe(initial);
    expect(handle.docSync()).toBe(handle.doc());
    expect(Object.isFrozen(handle.doc().stations.a)).toBe(true);
    expect(() => {
      (handle.doc() as TestDoc).name = "direct";
    }).toThrow(TypeError);
  });

  it("applies change() immediately, records the action, and emits change", () => {
    const handle = new LocalDocHandle(makeTestDoc(), "local:custom");
    const before = handle.doc();
    const onChange = vi.fn();
    handle.on("change", onChange);

    handle.change((d) => {
      d.stations.a.name = "A2";
      d.order.push("c");
    });
    const doc = handle.doc();
    expect(doc.stations.a.name).toBe("A2");
    expect(doc.order).toEqual(["a", "b", "c"]);
    expect(doc.stations.b).toBe(before.stations.b);
    expect(before.stations.a.name).toBe("A");
    expect(Object.isFrozen(doc.order)).toBe(true);
    expect(handle.actions).toHaveLength(1);
    expect(handle.actions[0].type).toBe("document/patch");
    expect(handle.actions[0].payload.patches).toHaveLength(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ doc, patches: handle.actions[0].payload.patches });
  });

  it("returns the mutator's return value", () => {
    const handle = new LocalDocHandle(makeTestDoc());
    const result = handle.change((d) => {
      d.stations.c = { name: "C" };
      return Object.keys(d.stations).length;
    });
    expect(result).toBe(3);
    expect(handle.change((d) => d.name)).toBe("mission");
  });

  it("produces no action and no event when nothing changed", () => {
    const handle = new LocalDocHandle(makeTestDoc());
    const before = handle.doc();
    const onChange = vi.fn();
    handle.on("change", onChange);
    handle.change(() => {});
    handle.change((d) => {
      d.name = "mission";
      d.stations.a.tags![0] = "x";
    });
    expect(handle.actions).toEqual([]);
    expect(handle.doc()).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("discards a mutation that throws", () => {
    const handle = new LocalDocHandle(makeTestDoc());
    const before = handle.doc();
    expect(() =>
      handle.change((d) => {
        d.name = "partial";
        throw new Error("abort");
      })
    ).toThrow("abort");
    expect(handle.doc()).toBe(before);
    expect(handle.actions).toEqual([]);
  });

  it("supports off, once, and removeAllListeners", () => {
    const handle = new LocalDocHandle(makeTestDoc());
    const on = vi.fn();
    const once = vi.fn();
    handle.on("change", on).once("change", once);
    handle.change((d) => {
      d.name = "1";
    });
    handle.change((d) => {
      d.name = "2";
    });
    expect(on).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledTimes(1);

    handle.off("change", on);
    handle.change((d) => {
      d.name = "3";
    });
    expect(on).toHaveBeenCalledTimes(2);

    const again = vi.fn();
    handle.on("change", again).removeAllListeners("change");
    handle.change((d) => {
      d.name = "4";
    });
    expect(again).not.toHaveBeenCalled();
  });

  it("keeps notifying other listeners when one throws", () => {
    const handle = new LocalDocHandle(makeTestDoc());
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    handle.on("change", () => {
      throw new Error("listener failed");
    });
    handle.on("change", after);
    try {
      handle.change((d) => {
        d.name = "x";
      });
    } finally {
      consoleError.mockRestore();
    }
    expect(after).toHaveBeenCalledTimes(1);
    expect(handle.doc().name).toBe("x");
  });

  it("fires delete once and refuses changes afterwards", async () => {
    const handle = new LocalDocHandle(makeTestDoc());
    const onDelete = vi.fn();
    handle.on("delete", onDelete);
    handle.delete();
    handle.delete();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(handle.isDeleted()).toBe(true);
    expect(handle.isReady()).toBe(false);
    expect(() =>
      handle.change((d) => {
        d.name = "x";
      })
    ).toThrow("was deleted");
    await expect(handle.flush()).resolves.toBeUndefined();
  });
});
