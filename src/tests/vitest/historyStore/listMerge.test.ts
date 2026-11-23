import {
  DOCUMENT_PATCH,
  documentReducer,
  produceDocumentChange,
} from "historyStore/documentReducer";
import isEqual from "lodash/isEqual";
import { deepFreeze } from "historyStore/util";
import { createSeededRandom } from "../helpers/seededRandom";

type Item = { uuid: string; name: string; tags: string[] };
type ListDoc = {
  items: Item[];
  folder: { items: string[] };
  layerOrder: PresetLayerOrder[];
  keyed: { key: string; v: number }[];
};

const item = (uuid: string, name = uuid.toUpperCase()): Item => ({ uuid, name, tags: [] });

const makeListDoc = (): ListDoc => ({
  items: [item("a"), item("b"), item("c")],
  folder: { items: ["s1", "s2", "s3"] },
  layerOrder: [
    { layerUuid: "l1", sublayerUuids: ["x"] },
    { layerUuid: "l2", sublayerUuids: [] },
  ],
  keyed: [
    { key: "k1", v: 1 },
    { key: "k2", v: 2 },
  ],
});

const patchAction = (patches: HistoryPatch[]): BaseHistoryAction => ({
  type: DOCUMENT_PATCH,
  payload: { patches },
  historyId: "h",
  userId: "vitest-user",
});

/** Make each change against `base` (concurrently), then apply them in order. */
const mergeConcurrent = <T>(base: T, ...fns: ((d: T) => void)[]): T => {
  const changes = fns.map((fn) => produceDocumentChange(base, fn));
  return changes.reduce((state, c) => documentReducer(state, patchAction(c.patches)), base);
};

const uuids = (items: { uuid: string }[]) => items.map((i) => i.uuid);

describe("list patches", () => {
  describe("normalization", () => {
    it("emits a list patch keyed by uuid", () => {
      const { patches } = produceDocumentChange(makeListDoc(), (d) => {
        d.items[1].name = "B2";
        d.items.push(item("d"));
      });
      expect(patches).toEqual([
        {
          op: "list",
          path: ["items"],
          idField: "uuid",
          removed: [],
          upserts: [
            { id: "b", after: "a", before: "c", value: { uuid: "b", name: "B2", tags: [] } },
            { id: "d", after: "c", before: null, value: item("d") },
          ],
        },
      ]);
    });

    it("includes the full order only when kept elements were reordered", () => {
      const moved = produceDocumentChange(makeListDoc(), (d) => {
        const [a] = d.items.splice(0, 1);
        d.items.push(a);
      });
      expect(moved.patches).toEqual([
        {
          op: "list",
          path: ["items"],
          idField: "uuid",
          removed: [],
          upserts: [],
          order: ["b", "c", "a"],
        },
      ]);
      const removedOnly = produceDocumentChange(makeListDoc(), (d) => {
        d.items.splice(1, 1);
      });
      expect(removedOnly.patches[0]).not.toHaveProperty("order");
    });

    it("identifies PresetLayerOrder elements by layerUuid", () => {
      const { patches } = produceDocumentChange(makeListDoc(), (d) => {
        d.layerOrder[0].sublayerUuids.push("y");
      });
      expect(patches).toEqual([
        {
          op: "list",
          path: ["layerOrder"],
          idField: "layerUuid",
          removed: [],
          upserts: [
            {
              id: "l1",
              after: null,
              before: "l2",
              value: { layerUuid: "l1", sublayerUuids: ["x", "y"] },
            },
          ],
        },
      ]);
    });

    it("identifies elements by key", () => {
      const { patches } = produceDocumentChange(makeListDoc(), (d) => {
        d.keyed[1].v = 3;
      });
      expect(patches[0]).toMatchObject({ op: "list", idField: "key", removed: [] });
    });

    it("prefers uuid over layerUuid and key", () => {
      const base = { list: [{ uuid: "u", layerUuid: "l", key: "k", n: 1 }] };
      const { patches } = produceDocumentChange(base, (d) => {
        d.list[0].n = 2;
      });
      expect(patches[0]).toMatchObject({ op: "list", idField: "uuid" });
    });

    it.each<[string, { list: unknown[] }, (d: { list: unknown[] }) => void]>([
      ["duplicate primitives", { list: ["a", "a"] }, (d) => d.list.push("b")],
      ["a duplicate added", { list: ["a", "b"] }, (d) => d.list.push("a")],
      [
        "duplicate uuids",
        { list: [{ uuid: "u" }, { uuid: "u" }] },
        (d) => d.list.push({ uuid: "v" }),
      ],
      ["mixed primitives and objects", { list: ["a", { uuid: "u" }] }, (d) => d.list.push("b")],
      [
        "objects with a non-string uuid",
        { list: [{ uuid: 1 }, { uuid: 2 }] },
        (d) => d.list.push({ uuid: 3 }),
      ],
      [
        "objects missing the id on some elements",
        { list: [{ uuid: "u" }, { name: "n" }] },
        (d) => d.list.push({ uuid: "v" }),
      ],
      ["nested arrays", { list: [[0, 1]] }, (d) => d.list.push([2, 3])],
    ])("falls back to a whole-array replace for %s", (_name, base, fn) => {
      const { patches, next } = produceDocumentChange(base, fn);
      expect(patches).toEqual([{ op: "replace", path: ["list"], value: next.list }]);
      expect(documentReducer(base, patchAction(patches))).toEqual(next);
    });

    it("emits add when the list was created and remove when it was deleted", () => {
      const base: { a?: string[]; b?: string[] } = { b: ["x"] };
      const { patches } = produceDocumentChange(base, (d) => {
        d.a = [];
        d.a.push("y");
        d.b!.push("z");
        delete d.b;
      });
      expect(patches).toEqual(
        expect.arrayContaining([
          { op: "add", path: ["a"], value: ["y"] },
          { op: "remove", path: ["b"] },
        ])
      );
      expect(patches).toHaveLength(2);
    });
  });

  describe("applying", () => {
    it("throws when the list target is missing or not an array", () => {
      const p = (path: string[]): HistoryPatch[] => [
        { op: "list", path, idField: "", removed: [], upserts: [] },
      ];
      const doc = { obj: { x: 1 }, list: [] as string[] };
      expect(() => documentReducer(doc, patchAction(p(["missing", "list"])))).toThrow(
        "List patch path does not resolve"
      );
      expect(() => documentReducer(doc, patchAction(p(["obj"])))).toThrow(
        "List patch target is not an array"
      );
      expect(() => documentReducer(doc, patchAction(p(["missingList"])))).toThrow(
        "List patch target is not an array"
      );
    });

    it("places an insert before its next neighbor when its previous neighbor was removed", () => {
      const merged = mergeConcurrent(
        makeListDoc(),
        (d) => {
          d.items.splice(0, 1);
        },
        (d) => {
          d.items.splice(1, 0, item("new"));
        }
      );
      expect(uuids(merged.items)).toEqual(["new", "b", "c"]);
    });

    it("appends an insert whose neighbors were both removed", () => {
      const merged = mergeConcurrent(
        makeListDoc(),
        (d) => {
          d.items.splice(0, 2);
        },
        (d) => {
          d.items.splice(1, 0, item("new"));
        }
      );
      expect(uuids(merged.items)).toEqual(["c", "new"]);
    });

    it("keeps an insert that was first at the start when its next neighbor was removed", () => {
      const merged = mergeConcurrent(
        makeListDoc(),
        (d) => {
          d.items.splice(0, 1);
        },
        (d) => {
          d.items.unshift(item("new"));
        }
      );
      expect(uuids(merged.items)).toEqual(["new", "b", "c"]);
    });

    it("does not mutate a frozen base", () => {
      const base = deepFreeze(makeListDoc());
      const merged = mergeConcurrent(base, (d) => {
        d.items.reverse();
        d.folder.items.push("s4");
      });
      expect(uuids(merged.items)).toEqual(["c", "b", "a"]);
      expect(uuids(base.items)).toEqual(["a", "b", "c"]);
      expect(merged.layerOrder).toBe(base.layerOrder);
    });
  });

  describe("concurrent edits", () => {
    it("keeps two concurrent pushes of different elements", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => d.items.push(item("d")),
        (d) => d.items.push(item("e"))
      );
      // The later push goes after its author's last element, so before the earlier push.
      expect(uuids(merged.items)).toEqual(["a", "b", "c", "e", "d"]);
    });

    it("lands an edit on its element after another user deleted an earlier element", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.items.splice(0, 1);
        },
        (d) => {
          d.items[1].name = "B edited";
        }
      );
      expect(merged.items).toEqual([{ ...item("b"), name: "B edited" }, item("c")]);
    });

    it("keeps a concurrent insert after the element it followed when the author reorders", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.items.splice(1, 0, item("x"));
        },
        (d) => {
          d.items.reverse();
        }
      );
      expect(uuids(merged.items)).toEqual(["c", "b", "a", "x"]);
    });

    it("keeps a concurrent insert at the start when its neighbor was moved", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.items.unshift(item("x"));
        },
        (d) => {
          d.items.reverse();
        }
      );
      expect(uuids(merged.items)).toEqual(["x", "c", "b", "a"]);
    });

    it("re-inserts an element that another user removed when the author edited it", () => {
      // An upsert for a missing id inserts it, so an edit restores a concurrently removed element.
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.items.splice(1, 1);
        },
        (d) => {
          d.items[1].name = "B edited";
        }
      );
      expect(merged.items).toEqual([item("a"), { ...item("b"), name: "B edited" }, item("c")]);
    });

    it("removes an element that another user edited earlier", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.items[1].name = "B edited";
        },
        (d) => {
          d.items.splice(1, 1);
        }
      );
      expect(uuids(merged.items)).toEqual(["a", "c"]);
    });

    it("applies the last writer's version of an element both users edited", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.items[0].name = "first";
          d.items[0].tags.push("t1");
        },
        (d) => {
          d.items[0].name = "second";
        }
      );
      expect(merged.items[0]).toEqual({ uuid: "a", name: "second", tags: [] });
    });

    it("merges PresetLayerOrder entries by layerUuid", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.layerOrder.unshift({ layerUuid: "l0", sublayerUuids: [] });
        },
        (d) => {
          d.layerOrder[1].sublayerUuids.push("z");
        }
      );
      expect(merged.layerOrder).toEqual([
        { layerUuid: "l0", sublayerUuids: [] },
        { layerUuid: "l1", sublayerUuids: ["x"] },
        { layerUuid: "l2", sublayerUuids: ["z"] },
      ]);
    });

    it("merges primitive string lists such as folder items", () => {
      const merged = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.folder.items.push("s4");
        },
        (d) => {
          d.folder.items.splice(0, 1);
        },
        (d) => {
          d.folder.items.splice(1, 0, "s9");
        }
      );
      // s9 followed the removed s1, so it goes before s2.
      expect(merged.folder.items).toEqual(["s9", "s2", "s3", "s4"]);
    });

    it("merges whole-array assignments by identity", () => {
      const filtered = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.folder.items.push("s4");
        },
        (d) => {
          d.folder.items = d.folder.items.filter((s) => s !== "s1");
        }
      );
      expect(filtered.folder.items).toEqual(["s2", "s3", "s4"]);
      const spread = mergeConcurrent(
        deepFreeze(makeListDoc()),
        (d) => {
          d.items.splice(1, 1);
        },
        (d) => {
          d.items = [...d.items, item("d")];
        }
      );
      expect(uuids(spread.items)).toEqual(["a", "c", "d"]);
    });

    it("replaces a numeric tuple edited concurrently whole, last writer wins", () => {
      const merged = mergeConcurrent(
        deepFreeze({ point: [1, 2] }),
        (d) => {
          d.point[1] = 5;
        },
        (d) => {
          d.point[1] = 7;
        }
      );
      expect(merged.point).toEqual([1, 7]);
    });
  });

  describe("randomized", () => {
    type Rng = () => number;
    const pick = <T>(rng: Rng, list: T[]): T => list[Math.floor(rng() * list.length)];
    const index = (rng: Rng, length: number) => Math.floor(rng() * length);

    /** One random in-place edit of a list, with new elements from `make`. */
    const editList = <T>(rng: Rng, list: T[], make: () => T, edit: (el: T) => void) => {
      const op = pick(rng, [
        "push",
        "unshift",
        "insert",
        "remove",
        "move",
        "edit",
        "assign",
        "reverse",
        "swap",
      ]);
      const at = index(rng, list.length + 1);
      if (op === "push") list.push(make());
      else if (op === "unshift") list.unshift(make());
      else if (op === "insert") list.splice(at, 0, make());
      else if (!list.length) list.push(make());
      else if (op === "remove") list.splice(index(rng, list.length), 1);
      else if (op === "move") {
        const [el] = list.splice(index(rng, list.length), 1);
        list.splice(index(rng, list.length + 1), 0, el);
      } else if (op === "edit") edit(list[index(rng, list.length)]);
      else if (op === "assign") list[index(rng, list.length)] = make();
      else if (op === "reverse") list.reverse();
      else {
        const i = index(rng, list.length);
        const j = index(rng, list.length);
        [list[i], list[j]] = [list[j], list[i]];
      }
    };

    const randomEdit = (rng: Rng, prefix: string) => {
      let n = 0;
      const id = () => `${prefix}${n++}`;
      return (d: ListDoc) => {
        const steps = 1 + index(rng, 5);
        for (let s = 0; s < steps; s++) {
          const target = pick(rng, ["items", "folder", "layerOrder", "keyed"]);
          if (target === "items") {
            editList(
              rng,
              d.items,
              () => item(id()),
              (el) => {
                if (rng() < 0.5) el.name = id();
                else el.tags.push(id());
              }
            );
          } else if (target === "folder") {
            editList(rng, d.folder.items, id, () => undefined);
          } else if (target === "layerOrder") {
            editList(
              rng,
              d.layerOrder,
              (): PresetLayerOrder => ({ layerUuid: id(), sublayerUuids: [] }),
              (el) => el.sublayerUuids.push(id())
            );
          } else {
            editList(
              rng,
              d.keyed,
              () => ({ key: id(), v: 0 }),
              (el) => (el.v += 1)
            );
          }
        }
      };
    };

    it("replays the author's change exactly", () => {
      const rng = createSeededRandom(1234);
      let base = deepFreeze(makeListDoc());
      for (let i = 0; i < 500; i++) {
        const { next, patches } = produceDocumentChange(base, randomEdit(rng, `r${i}-`));
        const replayed = documentReducer(base, patchAction(JSON.parse(JSON.stringify(patches))));
        expect(replayed).toEqual(next);
        base = deepFreeze(next);
      }
    });

    /** One random whole-array assignment (filter or spread) over an existing list. */
    const randomAssign = (rng: Rng, prefix: string) => {
      let n = 0;
      const id = () => `${prefix}${n++}`;
      return (d: ListDoc) => {
        const target = pick(rng, ["items", "folder", "layerOrder", "keyed"]);
        const filter = rng() < 0.5;
        if (target === "items") {
          const drop = pick(rng, d.items)?.uuid;
          d.items = filter ? d.items.filter((el) => el.uuid !== drop) : [...d.items, item(id())];
        } else if (target === "folder") {
          const drop = pick(rng, d.folder.items);
          d.folder.items = filter
            ? d.folder.items.filter((s) => s !== drop)
            : [id(), ...d.folder.items];
        } else if (target === "layerOrder") {
          const drop = pick(rng, d.layerOrder)?.layerUuid;
          d.layerOrder = filter
            ? d.layerOrder.filter((el) => el.layerUuid !== drop)
            : [...d.layerOrder, { layerUuid: id(), sublayerUuids: [] }];
        } else {
          const drop = pick(rng, d.keyed)?.key;
          d.keyed = filter
            ? d.keyed.filter((el) => el.key !== drop)
            : [...d.keyed, { key: id(), v: 0 }];
        }
      };
    };

    it("replays the author's whole-array assignments exactly", () => {
      const rng = createSeededRandom(2468);
      let base = deepFreeze(makeListDoc());
      for (let i = 0; i < 500; i++) {
        const fn = rng() < 0.5 ? randomAssign(rng, `w${i}-`) : randomEdit(rng, `e${i}-`);
        const { next, patches } = produceDocumentChange(base, fn);
        const replayed = documentReducer(base, patchAction(JSON.parse(JSON.stringify(patches))));
        expect(replayed).toEqual(next);
        base = deepFreeze(next);
      }
    });

    it("keeps concurrent additions and removals of folder items", () => {
      const rng = createSeededRandom(98765);
      let base = deepFreeze(makeListDoc());
      for (let i = 0; i < 300; i++) {
        const first = produceDocumentChange(base, randomEdit(rng, `a${i}-`));
        const second = produceDocumentChange(base, randomEdit(rng, `b${i}-`));
        const merged = [first, second].reduce(
          (state, c) => documentReducer(state, patchAction(c.patches)),
          base
        );
        const before = new Set(base.folder.items);
        const firstSet = new Set(first.next.folder.items);
        const secondSet = new Set(second.next.folder.items);
        const result = merged.folder.items;
        expect(new Set(result).size).toBe(result.length);
        for (const s of [...firstSet, ...secondSet]) {
          if (before.has(s)) continue;
          expect(result).toContain(s);
        }
        for (const s of before) {
          // Primitive elements cannot be edited, so a removal by either user sticks.
          if (!firstSet.has(s) || !secondSet.has(s)) expect(result).not.toContain(s);
          else expect(result).toContain(s);
        }
        base = deepFreeze(merged);
      }
    });

    it("keeps concurrent additions and removals of uuid elements", () => {
      const rng = createSeededRandom(4242);
      let base = deepFreeze(makeListDoc());
      for (let i = 0; i < 300; i++) {
        const first = produceDocumentChange(base, randomEdit(rng, `a${i}-`));
        const second = produceDocumentChange(base, randomEdit(rng, `b${i}-`));
        const merged = [first, second].reduce(
          (state, c) => documentReducer(state, patchAction(c.patches)),
          base
        );
        const ids = uuids(merged.items);
        expect(new Set(ids).size).toBe(ids.length);
        const baseById = new Map(base.items.map((el) => [el.uuid, el]));
        const secondById = new Map(second.next.items.map((el) => [el.uuid, el]));
        for (const id of uuids(first.next.items)) {
          if (!baseById.has(id)) expect(ids).toContain(id);
        }
        for (const [id, el] of secondById) {
          // The second change is applied last, so every element it added or changed is present.
          if (!isEqual(baseById.get(id), el))
            expect(merged.items.find((m) => m.uuid === id)).toEqual(el);
        }
        for (const id of baseById.keys()) {
          if (!secondById.has(id)) expect(ids).not.toContain(id);
        }
        base = deepFreeze(merged);
      }
    });
  });
});
