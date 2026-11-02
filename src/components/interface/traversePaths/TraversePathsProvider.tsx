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
 * dropped when its row stops applying (e.g. a station moved). Each preview
 * gets a mission-DEM terrain profile so elevation and slope follow it.
 * Consumers read traverses through `useDisplayedTraverse(s)`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getTraversePathRows } from "http-client/traversePath";
import { getTerrainProfile, normalizeTerrainProfile } from "http-client/terrainProfile";
import { getTraverseEndpoints } from "operations/helpers/getTraverseEndpoints";
import { getSequenceTraverseUuids } from "operations/helpers/evaSequence";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import {
  TRAVERSE_PATH_MIN_LENGTH_M,
  TRAVERSE_PATH_POLL_MS,
  applyTraversePathPreview,
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

const EMPTY_PREVIEWS: Record<string, TraversePathPreview> = {};

/** Previews by traverse uuid; empty outside a provider. */
export function useTraversePathPreviews(): Record<string, TraversePathPreview> {
  return useContext(TraversePathsContext)?.previewByTraverseUuid ?? EMPTY_PREVIEWS;
}

/** A traverse as displayed in this tab: the doc traverse with any preview applied. */
export function useDisplayedTraverse(traverse: Traverse | undefined): Traverse | undefined {
  const preview = useTraversePathPreviews()[traverse?.uuid ?? ""];
  return useMemo(() => applyTraversePathPreview(traverse, preview), [traverse, preview]);
}

/** Traverses as displayed in this tab; the same array when nothing is previewed. */
export function useDisplayedTraverses(traverses: Traverse[] | undefined): Traverse[] | undefined {
  const previews = useTraversePathPreviews();
  return useMemo(() => {
    if (!traverses?.some((t) => t && previews[t.uuid])) return traverses;
    return traverses.map((t) => (t ? applyTraversePathPreview(t, previews[t.uuid]) : t));
  }, [traverses, previews]);
}

/** A uuid-keyed traverse map as displayed in this tab; the same object when nothing is previewed. */
export function useDisplayedTraverseRecord(
  record: Record<string, Traverse> | undefined
): Record<string, Traverse> | undefined {
  const previews = useTraversePathPreviews();
  return useMemo(() => {
    if (!record) return record;
    const uuids = Object.keys(previews).filter((uuid) => record[uuid]);
    if (uuids.length === 0) return record;
    const next: Record<string, Traverse> = { ...record };
    for (const uuid of uuids) next[uuid] = applyTraversePathPreview(record[uuid], previews[uuid]);
    return next;
  }, [record, previews]);
}

/** Terrain profile for a preview from the mission DEM, or null without one. */
export const apiProfileFetcher: TraversePathProfileFetcher = async ({
  missionId,
  rowUuid,
  path,
  segmentDistances,
}) => {
  const res = await getTerrainProfile({
    missionId,
    path,
    pathSegmentDistances: segmentDistances,
    entityKey: `tpp-${rowUuid}`.slice(0, 64),
  });
  if (res.status !== "success") return null;
  return normalizeTerrainProfile(res.data, path, segmentDistances);
};

const apiFetcher: Fetcher = ({ missionId, targets }) =>
  getTraversePathRows({ missionId, refUuids: [...new Set(targets.map((t) => t.refUuid))] });

function plainPoint(point: AEGISPoint | undefined): AEGISPoint | undefined {
  return isLocated(point) ? { lat: point.lat, lng: point.lng } : undefined;
}

function profileKey(preview: { rowUuid: string; path: AEGISPoint[] }): string {
  return `${preview.rowUuid}|${JSON.stringify(preview.path)}`;
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
  /** Null disables preview profiles. */
  profileFetcher?: TraversePathProfileFetcher | null;
  pollMs?: number;
};

export function TraversePathsProvider({
  missionId,
  children,
  source: sourceProp,
  fetcher: fetcherProp,
  profileFetcher = apiProfileFetcher,
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
  const hasDem = useMissionDocSelector((m) => !!m.demFilePath, refEqual);

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

  const basePreviews = useMemo(() => {
    const previews: Record<string, Omit<TraversePathPreview, "profile" | "profileStatus">> = {};
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

  // Profiles keyed by row uuid and path, so a re-simplified path is refetched.
  const [profiles, setProfiles] = useState<
    Record<string, { key: string; profile: TerrainProfile | null }>
  >({});
  const requestedProfileKeys = useRef(new Set<string>());
  const profilesEnabled = !!profileFetcher && hasDem && missionId != null;

  useEffect(() => {
    if (!profilesEnabled) return;
    for (const preview of Object.values(basePreviews)) {
      const key = profileKey(preview);
      if (requestedProfileKeys.current.has(key)) continue;
      requestedProfileKeys.current.add(key);
      profileFetcher({
        missionId,
        rowUuid: preview.rowUuid,
        path: preview.path,
        segmentDistances: preview.segmentDistances,
      })
        .catch((): TerrainProfile | null => null)
        .then((profile) => {
          setProfiles((prev) => ({ ...prev, [preview.rowUuid]: { key, profile } }));
        });
    }
  }, [basePreviews, profilesEnabled, profileFetcher, missionId]);

  const previewByTraverseUuid = useMemo(() => {
    const previews: Record<string, TraversePathPreview> = {};
    for (const [traverseUuid, base] of Object.entries(basePreviews)) {
      const cached = profiles[base.rowUuid];
      const loaded = cached?.key === profileKey(base) ? cached : null;
      let profileStatus: TraversePathProfileStatus;
      if (!profilesEnabled) profileStatus = "unavailable";
      else if (!loaded) profileStatus = "loading";
      else profileStatus = loaded.profile ? "ready" : "unavailable";
      previews[traverseUuid] = { ...base, profile: loaded?.profile ?? null, profileStatus };
    }
    return previews;
  }, [basePreviews, profiles, profilesEnabled]);

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
