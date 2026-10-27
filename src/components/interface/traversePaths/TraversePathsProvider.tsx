/**
 * TraversePathsProvider — fetches Newton path options for the selected EVA's
 * traverses and shares them with the map and the traverse pane.
 *
 * Rows come from `GET /api/v1/traversePath`, or from an in-browser mock while
 * the backend is being built (see `getTraversePathSource`). Polling runs only
 * while a row that applies is unfinished, or briefly after endpoints change so
 * rows created by the server watcher are picked up.
 *
 * Also holds which option is active per traverse. This is a client-side
 * preview only: the doc's `traverse.path` is unchanged, and a preview is
 * dropped when its row stops applying (e.g. a station moved).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getTraversePathRows } from "http-client/traversePath";
import { getTraverseEndpoints } from "operations/helpers/getTraverseEndpoints";
import { getSequenceTraverseUuids } from "operations/helpers/evaSequence";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  TRAVERSE_PATH_MIN_LENGTH_M,
  TRAVERSE_PATH_POLL_MS,
  buildTraversePathPreview,
  getTraversePathSource,
  isLocated,
  isRowFinished,
  splitRowsForTarget,
} from "utils/traversePath";
import { getMockTraversePathRows } from "utils/traversePathMock";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";

/** How long to keep polling for rows after a traverse's endpoints change. */
export const TRAVERSE_PATH_DISCOVERY_MS = 60_000;

type Fetcher = (args: {
  missionId: number;
  targets: TraversePathTarget[];
}) => Promise<WrappedResponse<TraversePathRow[]>>;

const EMPTY_TARGETS: TraversePathTarget[] = [];

const TraversePathsContext = createContext<TraversePathsContextValue | null>(null);

/** Null outside a provider, so callers can render nothing. */
export function useTraversePathsContext(): TraversePathsContextValue | null {
  return useContext(TraversePathsContext);
}

const apiFetcher: Fetcher = ({ missionId, targets }) =>
  getTraversePathRows({ missionId, refUuids: [...new Set(targets.map((t) => t.refUuid))] });

function plainPoint(point: AEGISPoint | undefined): AEGISPoint | undefined {
  return isLocated(point) ? { lat: point.lat, lng: point.lng } : undefined;
}

function groupByRefUuid(rows: TraversePathRow[]): Record<string, TraversePathRow[]> {
  const grouped: Record<string, TraversePathRow[]> = {};
  for (const row of rows) (grouped[row.traverseRefUuid] ??= []).push(row);
  return grouped;
}

/** True when the server could still create rows for this target. */
function isPlannable(target: TraversePathTarget, radius: number): boolean {
  if (!isLocated(target.start) || !isLocated(target.end)) return false;
  const d = getDistanceBetweenTwoCoordinates(target.start, target.end, radius) ?? 0;
  return d >= TRAVERSE_PATH_MIN_LENGTH_M;
}

type Props = {
  missionId: number | null;
  children: ReactNode;
  source?: TraversePathSource;
  fetcher?: Fetcher;
  pollMs?: number;
};

export function TraversePathsProvider({
  missionId,
  children,
  source: sourceProp,
  fetcher: fetcherProp,
  pollMs = TRAVERSE_PATH_POLL_MS,
}: Props): JSX.Element {
  const source = useMemo(() => sourceProp ?? getTraversePathSource(), [sourceProp]);
  const fetcher: Fetcher | null = useMemo(() => {
    if (fetcherProp) return fetcherProp;
    if (source === "api") return apiFetcher;
    if (source === "mock") return getMockTraversePathRows;
    return null;
  }, [fetcherProp, source]);

  const selectedEvaUuid = useAppSelector((s) => s.eva.selectedEvaUuid, refEqual);
  const sectionSelected = useAppSelector((s) => s.interface.sectionSelectedLabel, refEqual);
  const planetRadius = useMissionDocSelector((m) => m.planetRadius ?? 1737400, refEqual);

  const selectedTargets =
    useMissionDocSelector((m) => {
      if (sectionSelected !== "evas" || !selectedEvaUuid) return EMPTY_TARGETS;
      const eva = m.evas?.[selectedEvaUuid];
      if (!eva) return EMPTY_TARGETS;
      const result: TraversePathTarget[] = [];
      for (const uuid of getSequenceTraverseUuids(eva.sequence)) {
        const traverse = uuid ? m.traverses?.[uuid] : undefined;
        if (!traverse?.refUuid) continue;
        const { locationBefore, locationAfter } = getTraverseEndpoints(
          uuid,
          eva.sequence,
          m.stations
        );
        result.push({
          traverseUuid: uuid,
          refUuid: traverse.refUuid,
          start: plainPoint(locationBefore),
          end: plainPoint(locationAfter),
        });
      }
      return result;
    }, deepEqual) ?? EMPTY_TARGETS;

  // Polling restarts only when the targets' contents change, not their identity.
  const targetsKey = JSON.stringify(selectedTargets);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const targets = useMemo(() => selectedTargets, [targetsKey]);

  const [rowsByRefUuid, setRowsByRefUuid] = useState<Record<string, TraversePathRow[]>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [highlightedPathUuid, setHighlightedPathUuidState] = useState<string | null>(null);
  const setHighlightedPathUuid = useCallback(
    (uuid: string | null) => setHighlightedPathUuidState(uuid),
    []
  );

  const [activeRowByTraverseUuid, setActiveRowByTraverseUuid] = useState<Record<string, string>>(
    {}
  );
  const setActivePath = useCallback((traverseUuid: string, rowUuid: string | null) => {
    setActiveRowByTraverseUuid((prev) => {
      const next = { ...prev };
      if (rowUuid) next[traverseUuid] = rowUuid;
      else delete next[traverseUuid];
      return next;
    });
  }, []);

  const previewByTraverseUuid = useMemo(() => {
    const previews: Record<string, TraversePathPreview> = {};
    for (const target of targets) {
      const rowUuid = activeRowByTraverseUuid[target.traverseUuid];
      if (!rowUuid) continue;
      const { applying } = splitRowsForTarget(rowsByRefUuid[target.refUuid], target);
      const row = applying.find((r) => r.uuid === rowUuid);
      const preview = row ? buildTraversePathPreview(row, target, planetRadius) : null;
      if (preview) previews[target.traverseUuid] = preview;
    }
    return previews;
  }, [targets, activeRowByTraverseUuid, rowsByRefUuid, planetRadius]);

  useEffect(() => {
    if (!fetcher || missionId == null || targets.length === 0) {
      setRowsByRefUuid({});
      setFetchError(null);
      setIsPolling(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const run = async () => {
      let res: WrappedResponse<TraversePathRow[]>;
      try {
        res = await fetcher({ missionId, targets });
      } catch (err) {
        res = { status: "error", message: err instanceof Error ? err.message : String(err) };
      }
      if (cancelled) return;

      let keepPolling: boolean;
      if (res.status === "success") {
        const grouped = groupByRefUuid(res.data ?? []);
        setRowsByRefUuid(grouped);
        setFetchError(null);
        const discovering = Date.now() - startedAt < TRAVERSE_PATH_DISCOVERY_MS;
        keepPolling = targets.some((target) => {
          const { applying } = splitRowsForTarget(grouped[target.refUuid], target);
          if (applying.some((row) => !isRowFinished(row))) return true;
          return discovering && applying.length === 0 && isPlannable(target, planetRadius);
        });
      } else {
        setFetchError(res.message || "Failed to load path options");
        keepPolling = true;
      }

      setIsPolling(keepPolling);
      if (keepPolling) timer = setTimeout(run, pollMs);
    };

    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetcher, missionId, targets, pollMs, planetRadius]);

  const value = useMemo<TraversePathsContextValue>(
    () => ({
      source,
      targets,
      rowsByRefUuid,
      fetchError,
      isPolling,
      highlightedPathUuid,
      setHighlightedPathUuid,
      previewByTraverseUuid,
      setActivePath,
    }),
    [
      source,
      targets,
      rowsByRefUuid,
      fetchError,
      isPolling,
      highlightedPathUuid,
      setHighlightedPathUuid,
      previewByTraverseUuid,
      setActivePath,
    ]
  );

  return <TraversePathsContext.Provider value={value}>{children}</TraversePathsContext.Provider>;
}
