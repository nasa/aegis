import { useEffect } from "react";

import { useAppDispatch } from "utils/useAppDispatch";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { thunkCancelPosEntryEdit } from "store/thunk/thunkRexPosEntry";

/** Keep draft cleanup active even when the Positions tab is hidden or minimized. */
export function usePosEntryEditSession(): void {
  const dispatch = useAppDispatch();
  const selectedRexUuid = useAppSelector((s) => s.rex.selectedRexUuid, refEqual);
  const inEdit = useAppSelector((s) => s.rex.posEntryInEdit, deepEqual);
  const sessionStale = useMissionDocSelector((m) => {
    if (!inEdit) return false;
    const rex = m.rexes?.[inEdit.rexUuid];
    return (
      inEdit.rexUuid !== selectedRexUuid ||
      !rex?.isRunning ||
      (!inEdit.isNew && !rex.posEntries?.some((entry) => entry.uuid === inEdit.uuid))
    );
  }, refEqual);

  useEffect(() => {
    if (sessionStale) dispatch(thunkCancelPosEntryEdit());
  }, [dispatch, sessionStale]);
}
