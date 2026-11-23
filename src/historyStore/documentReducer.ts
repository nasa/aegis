import { applyPatches, current, enablePatches, isDraft, produce, produceWithPatches } from "immer";
import type { Draft, Patch } from "immer";
import isEqual from "lodash/isEqual";

enablePatches();

/**
 * The history store is generic over Redux-style actions. AEGIS stores one mission per history
 * document, and every edit is an `apply*` mutator run against an Immer draft. The resulting
 * patches are the action payload, so the reducer below can replay any edit on any machine
 * without knowing what the edit was.
 */
export const DOCUMENT_INIT = "document-init";
export const DOCUMENT_PATCH = "document/patch";
export const DOCUMENT_REPLACE = "document/replace";

export type DocumentPatchAction = {
  type: typeof DOCUMENT_PATCH;
  payload: { patches: HistoryPatch[] };
};

export type DocumentReplaceAction = {
  type: typeof DOCUMENT_REPLACE;
  payload: { doc: unknown };
};

/**
 * Reduce one history action onto a document. Throws for actions that cannot apply, which the
 * history store turns into a rejection (server) or a rollback (client).
 */
export const documentReducer = <T>(state: T, action: BaseHistoryAction): T => {
  switch (action.type) {
    case DOCUMENT_INIT:
      return state;
    case DOCUMENT_PATCH:
      return applyDocumentPatches(state, (action.payload as { patches: HistoryPatch[] }).patches);
    case DOCUMENT_REPLACE:
      return (action.payload as { doc: T }).doc;
    default:
      throw new Error(`Unknown history action type: ${action.type}`);
  }
};

/** Apply normalized patches in order: Immer JSON patches, plus identity-keyed `list` patches. */
export const applyDocumentPatches = <T>(state: T, patches: HistoryPatch[]): T => {
  let result = state;
  let run: Patch[] = [];
  const flush = () => {
    if (run.length) result = applyPatches(result as object, run) as T;
    run = [];
  };
  for (const patch of patches) {
    if (patch.op !== "list") {
      run.push(patch as Patch);
      continue;
    }
    flush();
    result = produce(result, (draft) => {
      const parent = getAt(draft, patch.path.slice(0, -1));
      const key = patch.path[patch.path.length - 1];
      if (parent === null || typeof parent !== "object") {
        throw new Error(`List patch path does not resolve: ${JSON.stringify(patch.path)}`);
      }
      const container = parent as Record<string | number, unknown>;
      if (!Array.isArray(container[key])) {
        throw new Error(`List patch target is not an array: ${JSON.stringify(patch.path)}`);
      }
      container[key] = mergeList(container[key] as unknown[], patch);
    });
  }
  flush();
  return result;
};

const getAt = (root: unknown, path: (string | number)[]): unknown => {
  let node = root;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
};

/** Object fields that identify an element of a list, in order of preference. */
const IDENTITY_FIELDS = ["uuid", "layerUuid", "key"];

/** `""` identifies string elements by value; otherwise the object field holding the id. */
type IdentityField = string;

const identifyBy =
  (field: IdentityField) =>
  (item: unknown): string => {
    if (field === "") return typeof item === "string" ? item : `\u0000${JSON.stringify(item)}`;
    const id =
      item !== null && typeof item === "object"
        ? (item as Record<string, unknown>)[field]
        : undefined;
    // Elements without the field never match another element.
    return typeof id === "string" ? id : `\u0000${JSON.stringify(item)}`;
  };

/**
 * The identity field shared by every element of the lists, or null when there is none
 * (elements without an id, nested arrays, or duplicate ids). Lists without identity are
 * replaced whole.
 */
const listIdentityField = (...lists: unknown[][]): IdentityField | null => {
  const items = lists.flat();
  if (!items.length) return null;
  let field: IdentityField | undefined;
  // Numbers are values (coordinates, distances), not ids, so numeric arrays are replaced whole.
  if (items.every((item) => typeof item === "string")) field = "";
  else
    field = IDENTITY_FIELDS.find((name) =>
      items.every(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof (item as Record<string, unknown>)[name] === "string"
      )
    );
  if (field === undefined) return null;
  const identify = identifyBy(field);
  for (const list of lists) {
    if (new Set(list.map(identify)).size !== list.length) return null;
  }
  return field;
};

/**
 * Describe the change from `before` to `after` by element identity, so it can be replayed onto
 * a list that others changed concurrently. Returns null when the list has no identity.
 */
const diffList = (
  path: (string | number)[],
  before: unknown[],
  after: unknown[]
): HistoryPatch | null => {
  const idField = listIdentityField(before, after);
  if (idField === null) return null;
  const identify = identifyBy(idField);
  const beforeById = new Map(before.map((item) => [identify(item), item]));
  const afterIds = after.map(identify);
  const afterIdSet = new Set(afterIds);
  const removed = [...beforeById.keys()].filter((id) => !afterIdSet.has(id));
  const upserts: HistoryListUpsert[] = [];
  after.forEach((item, i) => {
    const id = afterIds[i];
    if (!beforeById.has(id) || !isEqual(beforeById.get(id), item)) {
      upserts.push({
        id,
        after: i > 0 ? afterIds[i - 1] : null,
        before: i < afterIds.length - 1 ? afterIds[i + 1] : null,
        value: item,
      });
    }
  });
  const keptBefore = before.map(identify).filter((id) => afterIdSet.has(id));
  const keptAfter = afterIds.filter((id) => beforeById.has(id));
  const reordered = keptBefore.some((id, i) => id !== keptAfter[i]);
  return {
    op: "list",
    path,
    idField,
    removed,
    upserts,
    ...(reordered ? { order: afterIds } : {}),
  };
};

/**
 * Apply a `list` patch to the current list. Elements are matched by identity: removals and
 * edits apply wherever the element now is, inserts go after the same neighbor as in the
 * author's list, and elements other users added concurrently are kept.
 */
const mergeList = (current: unknown[], patch: HistoryPatch): unknown[] => {
  const identify = identifyBy(patch.idField ?? "");
  const removed = new Set(patch.removed ?? []);
  let items = current.filter((item) => !removed.has(identify(item)));

  if (patch.order) {
    const byId = new Map(items.map((item) => [identify(item), item]));
    const ordered = patch.order.filter((id) => byId.has(id)).map((id) => byId.get(id));
    const placed = new Set(ordered.map(identify));
    // Elements the author never saw stay right after the element they followed.
    items.forEach((item, i) => {
      if (placed.has(identify(item))) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const prevAt = ordered.indexOf(items[j]);
        if (prevAt >= 0) {
          at = prevAt + 1;
          break;
        }
      }
      ordered.splice(at, 0, item);
      placed.add(identify(item));
    });
    items = ordered;
  }

  for (const { id, after, before, value } of patch.upserts ?? []) {
    const existing = items.findIndex((item) => identify(item) === id);
    if (existing >= 0) {
      items[existing] = value;
      continue;
    }
    items.splice(insertionIndex(items, identify, after, before ?? null), 0, value);
  }
  return items;
};

/**
 * Where to insert a new element: after the element it followed in the author's list, else
 * before the element it preceded (when the former was removed concurrently), else the start
 * (if it was first) or the end.
 */
const insertionIndex = (
  items: unknown[],
  identify: (item: unknown) => string,
  after: string | null,
  before: string | null
): number => {
  if (after === null) return 0;
  const prev = items.findIndex((item) => identify(item) === after);
  if (prev >= 0) return prev + 1;
  const next = before === null ? -1 : items.findIndex((item) => identify(item) === before);
  return next >= 0 ? next : items.length;
};

/** Length of the shortest path prefix that resolves to an array in `base` or `next`, or -1. */
const firstArrayPrefixLength = (
  base: unknown,
  next: unknown,
  path: (string | number)[]
): number => {
  let b = base;
  let n = next;
  for (let i = 0; i < path.length; i++) {
    if (Array.isArray(b) || Array.isArray(n)) return i;
    b = b !== null && typeof b === "object" ? (b as Record<string, unknown>)[path[i]] : undefined;
    n = n !== null && typeof n === "object" ? (n as Record<string, unknown>)[path[i]] : undefined;
  }
  return -1;
};

/**
 * Immer addresses array elements by index, so a patch made against one array would land on
 * the wrong element once a concurrent edit shifts it. Every patch inside an array is collapsed
 * onto the outermost array on its path. Lists whose elements have an identity (a `uuid`-like
 * field, or unique strings) become a `list` patch that merges by identity; other arrays
 * (coordinates, numeric series) are replaced whole, last writer wins. Object fields (every
 * entity map in a mission) still merge per key.
 */
export const normalizePatches = (
  base: unknown,
  next: unknown,
  patches: Patch[]
): HistoryPatch[] => {
  const result: HistoryPatch[] = [];
  const indexByPath = new Map<string, number>();
  const push = (patch: HistoryPatch) => {
    const key = JSON.stringify(patch.path);
    const existing = indexByPath.get(key);
    if (existing !== undefined) result[existing] = patch;
    else {
      indexByPath.set(key, result.length);
      result.push(patch);
    }
  };
  for (const patch of patches) {
    const arrayAt = firstArrayPrefixLength(base, next, patch.path);
    if (arrayAt < 0) {
      // A whole new array assigned over an existing one still merges by element identity.
      const before = getAt(base, patch.path);
      const after = getAt(next, patch.path);
      const list =
        patch.op === "replace" && Array.isArray(before) && Array.isArray(after)
          ? diffList(patch.path, before, after)
          : null;
      if (list) {
        push(list);
        continue;
      }
      push({
        op: patch.op,
        path: patch.path,
        ...(patch.op === "remove" ? {} : { value: patch.value }),
      });
      continue;
    }
    const arrayPath = patch.path.slice(0, arrayAt);
    const before = getAt(base, arrayPath);
    const after = getAt(next, arrayPath);
    if (after === undefined) {
      push({ op: "remove", path: arrayPath });
      continue;
    }
    const list =
      Array.isArray(before) && Array.isArray(after) ? diffList(arrayPath, before, after) : null;
    push(list ?? { op: before === undefined ? "add" : "replace", path: arrayPath, value: after });
  }
  // A patch on an ancestor path makes any patch below it redundant.
  return result.filter(
    (patch) =>
      !result.some(
        (other) =>
          other !== patch &&
          other.path.length < patch.path.length &&
          other.path.every((key, i) => patch.path[i] === key)
      )
  );
};

/** Replace any Immer drafts in `value` (at any depth) with plain snapshots. */
const snapshotDrafts = <V>(value: V, seen = new Set<unknown>()): V => {
  if (isDraft(value)) return current(value as Draft<V>) as V;
  if (value === null || typeof value !== "object" || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const key of Object.keys(value)) {
    const child = (value as Record<string, unknown>)[key];
    const snapshot = snapshotDrafts(child, seen);
    if (snapshot !== child) (value as Record<string, unknown>)[key] = snapshot;
  }
  return value;
};

/**
 * Run a mutator on a draft of `base`. Returns the new state, the mutator's return value, and
 * the normalized patches (empty when nothing changed).
 */
export const produceDocumentChange = <T, R>(
  base: T,
  fn: (draft: T) => R
): { next: T; result: R; patches: HistoryPatch[] } => {
  let result: R;
  const [next, patches] = produceWithPatches(base as object, (draft) => {
    // Drafts are revoked when the recipe ends, so the return value is snapshotted first.
    result = snapshotDrafts(fn(draft as T));
  });
  return {
    next: next as T,
    result,
    patches: patches.length ? normalizePatches(base, next, patches) : [],
  };
};
