import * as React from "react";
import type { AutomergeUrl, DocHandle } from "@automerge/automerge-repo";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { refEqual, useAppSelector, type EqualityFn } from "utils/useAppSelector";

// Union type for all supported automerge document types.
// Add new document types here as they are introduced.
type SupportedDocTypes = Mission;

type Unsubscribe = () => void;

class HandleStore<TDoc> {
  private listeners = new Set<() => void>();
  private refCount = 0;

  private cachedDoc: TDoc | undefined;
  private cacheValid = false;

  // The library passes a payload argument to the change callback, which we intentionally ignore.
  private readonly onChange = (_payload: unknown) => {
    // Invalidate snapshot cache; all selectors will re-read once.
    this.cacheValid = false;
    for (const l of this.listeners) l();
  };

  constructor(private handle: DocHandle<TDoc>) {}

  retain() {
    this.refCount++;
    if (this.refCount === 1) {
      this.handle.on("change", this.onChange);
    }
  }

  release() {
    this.refCount--;
    if (this.refCount <= 0) {
      this.refCount = 0;
      this.listeners.clear();
      this.cacheValid = false;
      this.cachedDoc = undefined;
      this.handle.off("change", this.onChange);
    }
  }

  subscribe = (listener: () => void): Unsubscribe => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): TDoc | undefined => {
    if (this.cacheValid) return this.cachedDoc;
    this.cachedDoc = this.handle.doc();
    this.cacheValid = true;
    return this.cachedDoc;
  };
}

// One store per handle. WeakMap means stores disappear when handles are GC’d.
// Keyed by DocHandle<unknown> (all DocHandles are objects); valued as HandleStore<unknown>
// so the map remains sound regardless of how many types SupportedDocTypes contains.
// The cast on retrieval is safe: a given DocHandle<TDoc> key can only ever have been
// stored with a HandleStore<TDoc> value, because getStore is the sole writer.
const storeByHandle = new WeakMap<DocHandle<unknown>, HandleStore<unknown>>();
function getStore<TDoc extends SupportedDocTypes>(handle: DocHandle<TDoc>): HandleStore<TDoc> {
  let store = storeByHandle.get(handle) as HandleStore<TDoc> | undefined;
  if (!store) {
    store = new HandleStore<TDoc>(handle);
    storeByHandle.set(handle, store);
  }
  return store;
}

/**
 * Shared-subscription selector hook.
 * - Only ONE underlying handle.on("change") per doc handle.
 * - Each hook instance still gets equality-gated re-renders.
 *
 * Two overloads exist intentionally:
 *
 * 1. WITH emptyDoc → return type is `TSel` (never undefined).
 *    Handles the mount-time race where useDocHandle returns undefined while
 *    the Automerge handle is still resolving. emptyDoc is used as a fallback
 *    so consumers get a guaranteed initial value and don't need to null-guard.
 *    emptyDoc is held in a ref (see emptyDocRef below) so inline object literals
 *    passed by callers don't invalidate getSnapshot on every render and cause
 *    infinite re-render loops via useSyncExternalStore.
 *
 * 2. WITHOUT emptyDoc → return type is `TSel | undefined`.
 *    Consumer must handle the undefined case while the handle is unresolved.
 *
 * @param TDoc - Must be one of the supported document types (SupportedDocTypes union)
 * @param TSel - The type of the selected value from the document
 * @param emptyDoc - Optional fallback document used when the handle has not yet
 *   resolved. Internally stored in a ref, so inline object literals are safe but
 *   discouraged — prefer a module-level constant or `useMemo` to avoid
 *   allocating a new object on every render.
 */
export function useDocSelector<TDoc extends SupportedDocTypes, TSel>(
  url: AutomergeUrl,
  selector: (doc: TDoc) => TSel,
  isEqual: EqualityFn,
  emptyDoc: TDoc
): TSel;
export function useDocSelector<TDoc extends SupportedDocTypes, TSel>(
  url: AutomergeUrl,
  selector: (doc: TDoc) => TSel,
  isEqual?: EqualityFn
): TSel | undefined;
export function useDocSelector<TDoc extends SupportedDocTypes, TSel>(
  url: AutomergeUrl,
  selector: (doc: TDoc) => TSel,
  isEqual: EqualityFn = Object.is,
  emptyDoc?: TDoc
): TSel | undefined {
  const handle = useDocHandle<TDoc>(url);

  // Keep a stable store for the current handle
  const store = React.useMemo(() => (handle ? getStore(handle) : undefined), [handle]);

  // Reference-count the shared subscription at the store level
  React.useEffect(() => {
    if (!store) return;
    store.retain();
    return () => store.release();
  }, [store]);

  // Per-hook selected value cache
  const lastSelRef = React.useRef<TSel | undefined>(undefined);
  const lastDocRef = React.useRef<TDoc | undefined>(undefined);
  const lastSelectorRef = React.useRef<typeof selector | undefined>(undefined);
  // Hold emptyDoc in a ref so callers can pass inline object literals without
  // breaking the getSnapshot cache or causing infinite loops. The ref is updated
  // on every render, but getSnapshot only reads it — it is intentionally excluded
  // from getSnapshot's dependency array.
  const emptyDocRef = React.useRef<TDoc | undefined>(emptyDoc);
  // Intentional ref write during render: emptyDocRef is read only inside getSnapshot
  // (a callback, not during render itself). This is the standard React escape hatch for
  // making a value available to callbacks without adding it to dependency arrays.
  // See: https://react.dev/reference/react/useRef#avoiding-recreating-the-ref-contents
  // eslint-disable-next-line react-hooks/refs
  emptyDocRef.current = emptyDoc;

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!store) return () => {};
      return store.subscribe(onStoreChange);
    },
    [store]
  );

  const getSnapshot = React.useCallback(() => {
    const doc = store?.getSnapshot() ?? emptyDocRef.current;
    if (!doc) return undefined;

    // If both the doc reference AND the selector identity are unchanged, reuse last selection.
    // Selector identity must be checked because callers commonly close over props/state
    // (e.g. a uuid prop) — when those change, the selector function changes and we must
    // re-run it even if the underlying doc reference has not changed.
    if (doc === lastDocRef.current && selector === lastSelectorRef.current) {
      return lastSelRef.current;
    }

    const nextSel = selector(doc);
    const prevSel = lastSelRef.current;

    // If selection is effectively the same, reuse old selection (preserves referential
    // equality for downstream consumers).
    if (
      lastSelectorRef.current !== undefined &&
      prevSel !== undefined &&
      isEqual(prevSel, nextSel)
    ) {
      lastDocRef.current = doc;
      lastSelectorRef.current = selector;
      return prevSel;
    }

    lastDocRef.current = doc;
    lastSelectorRef.current = selector;
    lastSelRef.current = nextSel;
    return nextSel;
    // emptyDocRef is intentionally excluded — it is a ref and never changes identity.
  }, [store, selector, isEqual]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Wrapper function to automatically use the automerge URL for the mission
 */
export function useMissionDocSelector<TSel>(
  selector: (doc: Mission) => TSel,
  isEqual: EqualityFn = Object.is
): TSel | undefined {
  // get automerge URL for this mission from the store. This is okay because we're only reading a configuration, not application data
  const automergeUrl = useAppSelector((state) => state.mission.automergeUrl, refEqual);
  return useDocSelector<Mission, TSel>(automergeUrl as AutomergeUrl, selector, isEqual);
}
