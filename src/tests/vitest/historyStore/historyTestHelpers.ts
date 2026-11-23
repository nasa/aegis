import { DOCUMENT_PATCH, produceDocumentChange } from "historyStore/documentReducer";

export type TestStation = { name: string; tags?: string[]; coordinates?: number[][] };
export type TestDoc = {
  name: string;
  stations: Record<string, TestStation>;
  order: string[];
};

export const makeTestDoc = (): TestDoc => ({
  name: "mission",
  stations: {
    a: { name: "A", tags: ["x"], coordinates: [[0, 0]] },
    b: { name: "B" },
  },
  order: ["a", "b"],
});

/** A `document/patch` action produced by running `fn` on a draft of `base`. */
export const patchAction = <T>(
  base: T,
  fn: (draft: T) => void
): { action: { type: typeof DOCUMENT_PATCH; payload: { patches: HistoryPatch[] } }; next: T } => {
  const { next, patches } = produceDocumentChange(base, fn);
  return { action: { type: DOCUMENT_PATCH, payload: { patches } }, next };
};

let pendingCounter = 0;

export const pendingPatch = <T>(
  base: T,
  fn: (draft: T) => void,
  historyId = `pending-${++pendingCounter}`,
  userId: string | number = "vitest-user"
): PendingHistoryAction => ({
  ...patchAction(base, fn).action,
  historyId,
  historyIndex: false,
  userId,
});

export const confirmedPatch = <T>(
  base: T,
  fn: (draft: T) => void,
  historyIndex: number,
  historyId = `confirmed-${historyIndex}-${++pendingCounter}`,
  userId: string | number = "vitest-other-user"
): ConfirmedHistoryAction => ({
  ...patchAction(base, fn).action,
  historyId,
  historyIndex,
  userId,
});
