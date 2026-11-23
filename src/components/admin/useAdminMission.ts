import { isValidDocumentId } from "historyStore/util";
import { useDocument } from "client/history/historyReact";
import { useEffect, useState } from "react";
import { getAutomergeDocListing } from "http-client/docListing";
import { useAsyncStatus } from "./useAsyncStatus";

/** Resolve the mission record and keep feedback visible while its document synchronizes. */
export function useAdminMission(missionId: number): {
  automergeUrl: HistoryDocumentId | undefined;
  mission: Mission | undefined;
  pending: string | null;
  error: string | null;
} {
  const [record, setRecord] = useState<{ missionId: number; url: HistoryDocumentId }>();
  const { pending, error, run } = useAsyncStatus("Loading mission…");
  const automergeUrl = record?.missionId === missionId ? record.url : undefined;
  const [mission] = useDocument<Mission>(automergeUrl);

  useEffect(() => {
    let cancelled = false;
    run("Loading mission…", async () => {
      try {
        const response = await getAutomergeDocListing(missionId);
        const url = response.data?.[0]?.automergeUrl;
        if (!url || !isValidDocumentId(url)) {
          throw new Error(response.message || "Mission record not found");
        }
        if (!cancelled) setRecord({ missionId, url });
      } catch (cause) {
        if (cancelled) return;
        throw cause;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [missionId, run]);

  return {
    automergeUrl,
    mission,
    pending: pending || (!error && !mission ? "Loading mission…" : null),
    error,
  };
}
