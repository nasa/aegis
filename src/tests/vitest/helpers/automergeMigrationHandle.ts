import * as Automerge from "@automerge/automerge";
import type { DocHandle as AutomergeDocHandle } from "@automerge/automerge-repo/slim";
import { generateBlankMission } from "store/storeUtils/mission";

/**
 * A minimal Automerge-backed handle for testing legacy Automerge migrations, which still run
 * on Automerge documents before they are imported into the history store.
 */
export const createAutomergeMigrationHandle = (
  mission: Mission = generateBlankMission()
): AutomergeDocHandle<Mission> => {
  let doc = Automerge.from(mission as unknown as Record<string, unknown>) as unknown as Mission;
  return {
    doc: () => doc,
    whenReady: async () => {},
    change: (fn: (m: Mission) => void) => {
      doc = Automerge.change(doc, fn);
    },
  } as unknown as AutomergeDocHandle<Mission>;
};
