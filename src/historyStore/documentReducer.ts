import { applyPatches, enablePatches, produceWithPatches } from "immer";
import type { Patch } from "immer";

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
      return applyPatches(state as object, (action.payload as { patches: Patch[] }).patches) as T;
    case DOCUMENT_REPLACE:
      return (action.payload as { doc: T }).doc;
    default:
      throw new Error(`Unknown history action type: ${action.type}`);
  }
};

const getAt = (root: unknown, path: (string | number)[]): unknown => {
  let node = root;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
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
 * into one `replace` of the outermost array on its path: arrays merge last-writer-wins as a
 * whole, while object fields (every entity map in a mission) still merge per key.
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
      push({ op: patch.op, path: patch.path, ...(patch.op === "remove" ? {} : { value: patch.value }) });
      continue;
    }
    const arrayPath = patch.path.slice(0, arrayAt);
    const value = getAt(next, arrayPath);
    if (value === undefined) push({ op: "remove", path: arrayPath });
    else push({ op: "replace", path: arrayPath, value });
  }
  // A whole-array replace makes any earlier patch below it redundant.
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
    result = fn(draft as T);
  });
  return {
    next: next as T,
    result,
    patches: patches.length ? normalizePatches(base, next, patches) : [],
  };
};
