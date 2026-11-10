import { useMemo } from "react";

import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { applyPosEntryDraft } from "utils/posEntries";
import { useMapContext } from "../MapProvider";

/**
 * The selected REX's position entries as drawn on this map. On the editor, the open edit session
 * replaces its saved entry (or is appended, for a new one) so the map previews unsaved values.
 */
export function useMapPosEntries(): PosEntry[] {
  const { mode } = useMapContext();
  const selectedRexUuid = useAppSelector((s) => s.rex?.selectedRexUuid ?? null, refEqual);
  const inEdit = useAppSelector(
    (s) => (mode === "editor" ? (s.rex?.posEntryInEdit ?? null) : null),
    deepEqual
  );
  const posEntries = useMissionDocSelector(
    (m) => (selectedRexUuid ? (m.rexes?.[selectedRexUuid]?.posEntries ?? []) : []),
    deepEqual
  );
  return useMemo(
    () => applyPosEntryDraft(posEntries ?? [], inEdit, selectedRexUuid),
    [posEntries, inEdit, selectedRexUuid]
  );
}
