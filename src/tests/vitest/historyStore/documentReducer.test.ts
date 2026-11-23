import { enablePatches, produceWithPatches } from "immer";
import {
  DOCUMENT_INIT,
  DOCUMENT_PATCH,
  DOCUMENT_REPLACE,
  documentReducer,
  normalizePatches,
  produceDocumentChange,
} from "historyStore/documentReducer";
import { deepFreeze } from "historyStore/util";
import { makeTestDoc, type TestDoc } from "./historyTestHelpers";

enablePatches();

const action = (type: string, payload?: unknown): BaseHistoryAction => ({
  type,
  payload,
  historyId: "h",
  userId: "vitest-user",
});

const patch = (patches: HistoryPatch[]) => action(DOCUMENT_PATCH, { patches });

/** Run `fn`, check the patches reproduce `next` on `base`, and return them. */
const changeOf = (base: TestDoc, fn: (d: TestDoc) => void) => {
  const res = produceDocumentChange(base, fn);
  expect(documentReducer(base, patch(res.patches))).toEqual(res.next);
  return res;
};

describe("documentReducer", () => {
  it("leaves state untouched for document-init", () => {
    const state = makeTestDoc();
    expect(documentReducer(state, action(DOCUMENT_INIT))).toBe(state);
  });

  it("replaces the document for document/replace", () => {
    const doc = { name: "replaced" };
    expect(documentReducer(makeTestDoc(), action(DOCUMENT_REPLACE, { doc }))).toBe(doc);
  });

  it("applies patches for document/patch without mutating a frozen base", () => {
    const base = deepFreeze(makeTestDoc());
    const next = documentReducer(
      base,
      patch([{ op: "replace", path: ["stations", "a", "name"], value: "A2" }])
    );
    expect(next.stations.a.name).toBe("A2");
    expect(base.stations.a.name).toBe("A");
    expect(next.stations.b).toBe(base.stations.b);
  });

  it("throws for unknown action types", () => {
    expect(() => documentReducer(makeTestDoc(), action("nope"))).toThrow(
      "Unknown history action type: nope"
    );
  });
});

describe("produceDocumentChange / normalizePatches", () => {
  it("keeps object-key edits granular", () => {
    const { patches, next } = changeOf(makeTestDoc(), (d) => {
      d.name = "renamed";
      d.stations.b.name = "B2";
    });
    expect(patches).toHaveLength(2);
    expect(patches).toEqual(
      expect.arrayContaining([
        { op: "replace", path: ["name"], value: "renamed" },
        { op: "replace", path: ["stations", "b", "name"], value: "B2" },
      ])
    );
    expect(next.name).toBe("renamed");
  });

  it("adds and deletes entities by key", () => {
    const { patches } = changeOf(makeTestDoc(), (d) => {
      d.stations.c = { name: "C" };
      delete d.stations.b;
    });
    expect(patches).toHaveLength(2);
    expect(patches).toEqual(
      expect.arrayContaining([
        { op: "add", path: ["stations", "c"], value: { name: "C" } },
        { op: "remove", path: ["stations", "b"] },
      ])
    );
  });

  it("returns the mutator's result and no patches when nothing changed", () => {
    const base = makeTestDoc();
    const res = produceDocumentChange(base, (d) => {
      d.stations.a.name = "A";
      return d.order.length;
    });
    expect(res.result).toBe(2);
    expect(res.patches).toEqual([]);
    expect(res.next).toBe(base);
  });

  it.each<[string, (d: TestDoc) => void, (string | number)[], string[], HistoryListUpsert[]]>([
    [
      "push",
      (d) => d.order.push("c"),
      ["order"],
      [],
      [{ id: "c", after: "b", before: null, value: "c" }],
    ],
    ["splice", (d) => d.order.splice(0, 1), ["order"], ["a"], []],
    [
      "index assignment",
      (d) => (d.order[1] = "z"),
      ["order"],
      ["b"],
      [{ id: "z", after: "a", before: null, value: "z" }],
    ],
    [
      "unshift",
      (d) => d.order.unshift("first"),
      ["order"],
      [],
      [{ id: "first", after: null, before: "a", value: "first" }],
    ],
    [
      "pop",
      (d) => {
        d.order.pop();
      },
      ["order"],
      ["b"],
      [],
    ],
    [
      "length truncation",
      (d) => {
        d.order.length = 1;
      },
      ["order"],
      ["b"],
      [],
    ],
    [
      "nested push",
      (d) => d.stations.a.tags!.push("y"),
      ["stations", "a", "tags"],
      [],
      [{ id: "y", after: "x", before: null, value: "y" }],
    ],
  ])("collapses an identity list %s into one list patch", (_name, fn, path, removed, upserts) => {
    const { patches } = changeOf(makeTestDoc(), fn);
    expect(patches).toEqual([{ op: "list", path, idField: "", removed, upserts }]);
  });

  it.each<[string, (d: TestDoc) => void, (string | number)[]]>([
    [
      "nested array element",
      (d) => (d.stations.a.coordinates![0][1] = 5),
      ["stations", "a", "coordinates"],
    ],
    [
      "nested array push",
      (d) => d.stations.a.coordinates!.push([1, 1]),
      ["stations", "a", "coordinates"],
    ],
  ])("collapses a no-identity array %s into one whole-array replace", (_name, fn, path) => {
    const { patches, next } = changeOf(makeTestDoc(), fn);
    const value = path.reduce<unknown>((n, k) => (n as Record<string | number, unknown>)[k], next);
    expect(patches).toEqual([{ op: "replace", path, value }]);
  });

  it("collapses edits to objects inside an identity list onto the outermost list", () => {
    type Doc = { evas: Record<string, { sequence: { uuid: string; meta: { n: number } }[] }> };
    const base: Doc = { evas: { e: { sequence: [{ uuid: "s1", meta: { n: 1 } }] } } };
    const { patches, next } = produceDocumentChange(base, (d) => {
      d.evas.e.sequence[0].uuid = "s2";
      d.evas.e.sequence[0].meta.n = 2;
    });
    expect(patches).toEqual([
      {
        op: "list",
        path: ["evas", "e", "sequence"],
        idField: "uuid",
        removed: ["s1"],
        upserts: [{ id: "s2", after: null, before: null, value: { uuid: "s2", meta: { n: 2 } } }],
      },
    ]);
    expect(documentReducer(base, patch(patches))).toEqual(next);
  });

  it("replaces the outermost array for edits to objects without an id inside arrays", () => {
    type Doc = { evas: Record<string, { sequence: { name: string; meta: { n: number } }[] }> };
    const base: Doc = { evas: { e: { sequence: [{ name: "s1", meta: { n: 1 } }] } } };
    const { patches, next } = produceDocumentChange(base, (d) => {
      d.evas.e.sequence[0].meta.n = 2;
    });
    expect(patches).toEqual([
      { op: "replace", path: ["evas", "e", "sequence"], value: next.evas.e.sequence },
    ]);
    expect(documentReducer(base, patch(patches))).toEqual(next);
  });

  it("emits one patch for many edits to the same array", () => {
    const { patches } = changeOf(makeTestDoc(), (d) => {
      d.order.push("c");
      d.order.push("d");
      d.order.splice(0, 1);
      d.order[0] = "B";
    });
    expect(patches).toEqual([
      {
        op: "list",
        path: ["order"],
        idField: "",
        removed: ["a", "b"],
        upserts: [
          { id: "B", after: null, before: "c", value: "B" },
          { id: "c", after: "B", before: "d", value: "c" },
          { id: "d", after: "c", before: null, value: "d" },
        ],
      },
    ]);
  });

  it("drops edits inside an array that is later replaced or removed", () => {
    const { patches } = changeOf(makeTestDoc(), (d) => {
      d.stations.a.tags!.push("y");
      delete d.stations.a.tags;
    });
    expect(patches).toEqual([{ op: "remove", path: ["stations", "a", "tags"] }]);
  });

  it("drops nested patches made redundant by a whole-array replace (direct normalize)", () => {
    const base = { list: [{ a: 1 }, { a: 2 }] };
    const [next, raw] = produceWithPatches(base, (d) => {
      d.list[0].a = 10;
      d.list.push({ a: 3 });
    });
    expect(normalizePatches(base, next, raw)).toEqual([
      { op: "replace", path: ["list"], value: next.list },
    ]);
  });

  it("diffs whole-array assignment by identity and keeps creation and no-identity arrays plain", () => {
    const { patches } = changeOf(makeTestDoc(), (d) => {
      d.order = ["only"];
      d.stations.b.tags = ["new"];
      d.stations.a.coordinates = [[1, 1]];
    });
    expect(patches).toHaveLength(3);
    expect(patches).toEqual(
      expect.arrayContaining([
        {
          op: "list",
          path: ["order"],
          idField: "",
          removed: ["a", "b"],
          upserts: [{ id: "only", after: null, before: null, value: "only" }],
        },
        { op: "add", path: ["stations", "b", "tags"], value: ["new"] },
        { op: "replace", path: ["stations", "a", "coordinates"], value: [[1, 1]] },
      ])
    );
  });

  it("produces JSON-serializable patches that survive a round trip", () => {
    const base = makeTestDoc();
    const { patches, next } = produceDocumentChange(base, (d) => {
      d.stations.a.coordinates!.push([2, 2]);
      d.order.reverse();
      d.stations.c = { name: "C", tags: [] };
      delete d.stations.b;
    });
    const roundTripped = JSON.parse(JSON.stringify(patches)) as HistoryPatch[];
    expect(documentReducer(base, patch(roundTripped))).toEqual(next);
  });

  describe("concurrent edits", () => {
    it("keeps both edits to different entity keys", () => {
      const base = deepFreeze(makeTestDoc());
      const a = produceDocumentChange(base, (d) => {
        d.stations.a.name = "A from client 1";
      });
      const b = produceDocumentChange(base, (d) => {
        d.stations.b.name = "B from client 2";
        d.stations.c = { name: "C" };
      });
      const merged = documentReducer(documentReducer(base, patch(a.patches)), patch(b.patches));
      expect(merged.stations.a.name).toBe("A from client 1");
      expect(merged.stations.b.name).toBe("B from client 2");
      expect(merged.stations.c).toEqual({ name: "C" });
    });

    it("keeps an array edit and an object edit on different keys", () => {
      const base = deepFreeze(makeTestDoc());
      const a = produceDocumentChange(base, (d) => d.stations.a.coordinates![0].push(9));
      const b = produceDocumentChange(base, (d) => {
        d.stations.a.name = "renamed";
      });
      const merged = documentReducer(documentReducer(base, patch(a.patches)), patch(b.patches));
      expect(merged.stations.a.coordinates).toEqual([[0, 0, 9]]);
      expect(merged.stations.a.name).toBe("renamed");
    });

    it("resolves concurrent edits to the same no-identity array last-writer-wins", () => {
      const base = deepFreeze(makeTestDoc());
      const a = produceDocumentChange(base, (d) => d.stations.a.coordinates!.push([1, 1]));
      const b = produceDocumentChange(base, (d) => (d.stations.a.coordinates![0][0] = 5));
      const merged = documentReducer(documentReducer(base, patch(a.patches)), patch(b.patches));
      expect(merged.stations.a.coordinates).toEqual([[5, 0]]);
    });

    it("merges concurrent edits to the same identity list by element", () => {
      const base = deepFreeze(makeTestDoc());
      const a = produceDocumentChange(base, (d) => d.order.push("from-a"));
      const b = produceDocumentChange(base, (d) => d.order.splice(0, 1));
      const merged = documentReducer(documentReducer(base, patch(a.patches)), patch(b.patches));
      expect(merged.order).toEqual(["b", "from-a"]);
    });

    it("throws when editing a field of a concurrently deleted entity", () => {
      const base = deepFreeze(makeTestDoc());
      const del = produceDocumentChange(base, (d) => {
        delete d.stations.a;
      });
      const edit = produceDocumentChange(base, (d) => {
        d.stations.a.name = "edited";
      });
      const afterDelete = documentReducer(base, patch(del.patches));
      expect(() => documentReducer(afterDelete, patch(edit.patches))).toThrow();
    });

    it("accepts a concurrent delete of an already deleted entity", () => {
      const base = deepFreeze(makeTestDoc());
      const del = produceDocumentChange(base, (d) => {
        delete d.stations.a;
      });
      const afterDelete = documentReducer(base, patch(del.patches));
      expect(documentReducer(afterDelete, patch(del.patches))).toEqual(afterDelete);
    });

    it("throws when editing an array inside a concurrently deleted entity", () => {
      const base = deepFreeze(makeTestDoc());
      const del = produceDocumentChange(base, (d) => {
        delete d.stations.a;
      });
      const edit = produceDocumentChange(base, (d) => d.stations.a.tags!.push("y"));
      const afterDelete = documentReducer(base, patch(del.patches));
      expect(() => documentReducer(afterDelete, patch(edit.patches))).toThrow();
    });
  });
});
