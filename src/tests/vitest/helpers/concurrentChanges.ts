import {
  DOCUMENT_PATCH,
  documentReducer,
  produceDocumentChange,
} from "historyStore/documentReducer";
import { deepFreeze } from "historyStore/util";

/**
 * Merge edits that clients made concurrently against the same `base`, the way the server
 * history store does: each edit's patches are applied in order onto the result of the
 * previous ones. An edit whose patches no longer apply is rejected and skipped.
 */
export const mergeConcurrentChanges = <T>(base: T, ...changes: ((doc: T) => void)[]): T => {
  const frozenBase = deepFreeze(JSON.parse(JSON.stringify(base)) as T);
  let state = frozenBase;
  for (const change of changes) {
    const { patches } = produceDocumentChange(frozenBase, change);
    try {
      state = documentReducer(state, {
        type: DOCUMENT_PATCH,
        payload: { patches },
        historyId: "",
        userId: "",
      });
    } catch {
      // Rejected, as the server would.
    }
  }
  return state;
};
