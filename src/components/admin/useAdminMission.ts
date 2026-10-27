import { useEffect, useState } from "react";
import { type AutomergeUrl, isValidAutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { getAutomergeDocListing } from "http-client/docListing";
import { useAsyncStatus } from "./useAsyncStatus";

/** Resolve the mission record and keep feedback visible while its document synchronizes. */
export function useAdminMission(missionId: number): {
  automergeUrl: AutomergeUrl | undefined;
  mission: Mission | undefined;
  pending: string | null;
  error: string | null;
} {
  const [record, setRecord] = useState<{ missionId: number; url: AutomergeUrl }>();
  const { pending, error, run } = useAsyncStatus("Loading mission…");
  const automergeUrl = record?.missionId === missionId ? record.url : undefined;
  const [mission] = useDocument<Mission>(automergeUrl);

  useEffect(() => {
    let cancelled = false;
    run("Loading mission…", async () => {
      try {
        const response = await getAutomergeDocListing(missionId);
        const url = response.data?.[0]?.automergeUrl;
        if (!url || !isValidAutomergeUrl(url)) {
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
