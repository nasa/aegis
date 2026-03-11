import * as React from "react";
import type { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocHandle } from "@automerge/automerge-repo-react-hooks";
import { refEqual, useAppSelector, type EqualityFn } from "utils/useAppSelector";

// Union type for all supported automerge document types
// Add new document types here as they are introduced
type SupportedDocTypes = Mission;

// You can tighten this type if you know the real handle type in your version.
type DocHandle<TDoc> = {
  on(event: "change", cb: () => void): void;
  off(event: "change", cb: () => void): void;
  doc(): TDoc | undefined;
};

type Unsubscribe = () => void;

class HandleStore<TDoc> {
  private listeners = new Set<() => void>();
  private refCount = 0;

  private cachedDoc: TDoc | undefined;
  private cacheValid = false;

  private readonly onChange = () => {
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
const storeByHandle = new WeakMap<object, HandleStore<SupportedDocTypes>>();

function getStore<TDoc extends SupportedDocTypes>(handle: DocHandle<TDoc>): HandleStore<TDoc> {
  const key = handle as unknown as object;
  let store = storeByHandle.get(key) as HandleStore<TDoc> | undefined;
  if (!store) {
    store = new HandleStore<TDoc>(handle);
    storeByHandle.set(key, store);
  }
  return store;
}

/**
 * Shared-subscription selector hook.
 * - Only ONE underlying handle.on("change") per doc handle.
 * - Each hook instance still gets equality-gated re-renders.
 * @param TDoc - Must be one of the supported document types (SupportedDocTypes union)
 * @param TSel - The type of the selected value from the document
 */
export function useDocSelector<TDoc extends SupportedDocTypes, TSel>(
  url: AutomergeUrl,
  selector: (doc: TDoc) => TSel,
  isEqual: EqualityFn = Object.is
): TSel | undefined {
  const handle = useDocHandle<TDoc>(url) as unknown as DocHandle<TDoc> | undefined;

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

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!store) return () => {};
      return store.subscribe(onStoreChange);
    },
    [store]
  );

  const getSnapshot = React.useCallback(() => {
    const doc = store?.getSnapshot();
    if (!doc) return undefined;

    // If doc reference is unchanged, reuse last selection.
    if (doc === lastDocRef.current) return lastSelRef.current;

    const nextSel = selector(doc);
    const prevSel = lastSelRef.current;

    // If selection is effectively the same, reuse old selection.
    if (prevSel !== undefined && isEqual(prevSel, nextSel)) {
      lastDocRef.current = doc;
      return prevSel;
    }

    lastDocRef.current = doc;
    lastSelRef.current = nextSel;
    return nextSel;
  }, [store, selector, isEqual]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Wrapper function to automatically use the automerge URL for the mission from the redux store
 */
export function useMissionDocSelector<TSel>(
  selector: (doc: Mission) => TSel,
  isEqual: EqualityFn = Object.is
): TSel | undefined {
  // get automerge URL for this mission from the store
  const automergeUrl = useAppSelector((state) => state.mission.automergeUrl, refEqual);
  return useDocSelector(automergeUrl as AutomergeUrl, selector, isEqual);
}
