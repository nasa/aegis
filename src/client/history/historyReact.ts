import * as React from "react";
import type { ClientDocHandle, ClientHistoryRepo } from "./ClientHistoryRepo";

/**
 * React bindings for the history store, matching the shape of
 * `@automerge/automerge-repo-react-hooks` (`RepoContext`, `useRepo`, `useDocHandle`,
 * `useDocument`).
 */
export const RepoContext = React.createContext<ClientHistoryRepo | null>(null);

export const useRepo = (): ClientHistoryRepo => React.useContext(RepoContext);

/** The handle for a document once it is ready, otherwise undefined. */
export function useDocHandle<T>(documentId: HistoryDocumentId | undefined): ClientDocHandle<T> {
  const repo = useRepo();
  const handle = React.useMemo(
    () => (repo && documentId ? repo.findSync<T>(documentId) : undefined),
    [repo, documentId]
  );
  const [ready, setReady] = React.useState(() => handle?.isReady() ?? false);
  React.useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setReady(handle.isReady());
    handle
      .whenReady()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return ready ? handle : undefined;
}

/** `[doc, changeDoc]` for a document, re-rendering on every change. */
export function useDocument<T>(
  documentId: HistoryDocumentId | undefined
): [T | undefined, (fn: (doc: T) => void) => void] {
  const handle = useDocHandle<T>(documentId);
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (!handle) return () => {};
      handle.on("change", onChange);
      return () => {
        handle.off("change", onChange);
      };
    },
    [handle]
  );
  const getSnapshot = React.useCallback(() => handle?.doc(), [handle]);
  const doc = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const changeDoc = React.useCallback(
    (fn: (doc: T) => void) => {
      handle?.change(fn);
    },
    [handle]
  );
  return [doc, changeDoc];
}
