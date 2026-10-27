/**
 * TraversePathCandidates — draws inactive path options as dashed lines under
 * the active traverse paths.
 *
 * Reads rows from `TraversePathsProvider`, keeps only succeeded rows whose
 * endpoints match the traverse's current endpoints, and draws one line per
 * comparable request hash. When a Newton option is active, the doc path is
 * drawn here as the "current path" candidate instead. With a traverse
 * selected only its options are shown.
 *
 * Clicking a candidate selects its traverse and makes the candidate active
 * (client-side preview, see `TraversePathsProvider`). Returns null.
 */

import { useEffect, useMemo, useRef } from "react";
import type { MapBrowserEvent } from "ol";
import { LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";

import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { thunkPolylineOnClick } from "store/thunk/thunkMap";
import {
  groupRowsByHash,
  manualCandidateId,
  rowToCandidate,
  splitRowsForTarget,
} from "utils/traversePath";
import { useTraversePathsContext } from "components/interface/traversePaths/TraversePathsProvider";
import {
  MANUAL_PATH_COLOR,
  traversePathOptionColor,
} from "components/interface/traversePaths/traversePathColors";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildTraversePathCandidateStyleFunction } from "../utils/styles/polylines";
import { Z_INDEX } from "../utils/zIndex";

type CandidateFeature = {
  id: string;
  traverseUuid: string;
  /** Row to activate on click; `null` restores the doc path. */
  rowUuid: string | null;
  path: AEGISPoint[];
  color: string;
};

export function TraversePathCandidates(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { toMapCoord } = useCoordConverters();
  const ctx = useTraversePathsContext();
  const highlightedPathUuid = ctx?.highlightedPathUuid ?? null;

  const selectedEvaSequenceItemUuid = useAppSelector(
    (s) => s.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const planetRadius = useMissionDocSelector((m) => m.planetRadius ?? 1737400, refEqual);
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);
  const editActive = !!mapDirective;

  const previewedTraverseUuids = Object.keys(ctx?.previewByTraverseUuid ?? {});
  const docPaths = useMissionDocSelector((m) => {
    const paths: Record<string, AEGISPoint[]> = {};
    for (const uuid of previewedTraverseUuids) {
      const path = m.traverses?.[uuid]?.path;
      if (path) paths[uuid] = path;
    }
    return paths;
  }, deepEqual);

  const source = useMemo(() => new VectorSource(), []);
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  useEffect(() => {
    const layer = new VectorLayer({ source, zIndex: Z_INDEX.TRAVERSE_PATH_CANDIDATES });
    map.addLayer(layer);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
      source.clear();
    };
  }, [map, source]);

  const features = useMemo((): CandidateFeature[] => {
    if (!ctx) return [];
    const selected = ctx.targets.find((t) => t.traverseUuid === selectedEvaSequenceItemUuid);
    const targets = selected ? [selected] : ctx.targets;
    const result: CandidateFeature[] = [];
    for (const target of targets) {
      const activeRowUuid = ctx.previewByTraverseUuid[target.traverseUuid]?.rowUuid ?? null;
      const docPath = docPaths?.[target.traverseUuid];
      if (activeRowUuid && docPath && docPath.length >= 2) {
        result.push({
          id: manualCandidateId(target.traverseUuid),
          traverseUuid: target.traverseUuid,
          rowUuid: null,
          path: docPath,
          color: MANUAL_PATH_COLOR,
        });
      }
      const { applying } = splitRowsForTarget(ctx.rowsByRefUuid[target.refUuid], target);
      groupRowsByHash(applying).forEach((group, index) => {
        if (group.some((r) => r.uuid === activeRowUuid)) return;
        const row = group.find((r) => r.status === "succeeded");
        const candidate = row ? rowToCandidate(row, planetRadius) : null;
        if (!candidate) return;
        result.push({
          id: row.uuid,
          traverseUuid: target.traverseUuid,
          rowUuid: row.uuid,
          path: candidate.path,
          color: traversePathOptionColor(index),
        });
      });
    }
    return result;
  }, [ctx, selectedEvaSequenceItemUuid, planetRadius, docPaths]);

  useEffect(() => {
    const mapper = ({ id, traverseUuid, rowUuid, path, color }: CandidateFeature) => {
      const valid = path.filter((p) => p.lat != null && p.lng != null);
      if (valid.length < 2) return null;
      const desc: FeatureDescriptor = {
        id,
        geometry: new LineString(valid.map((p) => toMapCoord(p))),
        properties: { color, traverseUuid, rowUuid, mapItemType: "traversePathCandidate" },
      };
      return desc;
    };
    reconcileFeatures(source, features, mapper);
  }, [features, source, toMapCoord]);

  useEffect(() => {
    layerRef.current?.setStyle(
      buildTraversePathCandidateStyleFunction({
        weight: config.traverse.weight,
        getColor: (f) => (f.get("color") as string) || "#ff9f1c",
        getIsHighlighted: (f) => f.getId() === highlightedPathUuid,
      })
    );
  }, [config, highlightedPathUuid]);

  /** Candidate under the pointer, unless an active traverse line is hit first. */
  const hitCandidate = useMemo(
    () => (evt: MapBrowserEvent) => {
      const onActiveLine = map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => (f.get("mapItemType") === "traverse" ? true : undefined),
        { layerFilter: (l) => l.getZIndex() === Z_INDEX.POLYLINES, hitTolerance: 5 }
      );
      if (onActiveLine) return null;
      return (
        map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
          layerFilter: (l) => l === layerRef.current,
          hitTolerance: 5,
        }) ?? null
      );
    },
    [map]
  );

  const setActivePath = ctx?.setActivePath;
  const setHighlightedPathUuid = ctx?.setHighlightedPathUuid;

  // --- Click: activate the candidate (disabled during any active edit) ---
  useEffect(() => {
    if (!config.traverse.clickable || editActive || !setActivePath) return;
    const handleClick = (evt: MapBrowserEvent) => {
      const hit = hitCandidate(evt);
      if (!hit) return;
      const traverseUuid = hit.get("traverseUuid") as string;
      dispatch(thunkPolylineOnClick({ polylineUuid: traverseUuid, mapItemType: "traverse" }));
      setActivePath(traverseUuid, (hit.get("rowUuid") as string | null) ?? null);
      setHighlightedPathUuid?.(null);
    };
    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [
    map,
    config.traverse.clickable,
    editActive,
    dispatch,
    hitCandidate,
    setActivePath,
    setHighlightedPathUuid,
  ]);

  // --- Hover: highlight the candidate and show a pointer ---
  useEffect(() => {
    if (!config.traverse.clickable || editActive || !setHighlightedPathUuid) return;
    let hoveredId: string | null = null;
    const handlePointerMove = (evt: MapBrowserEvent) => {
      const hit = hitCandidate(evt);
      const id = (hit?.getId() as string | undefined) ?? null;
      const el = map.getTargetElement();
      // Re-asserted every move: TraverseLines may reset the cursor on leave.
      if (el && id) el.style.cursor = "pointer";
      if (id === hoveredId) return;
      if (el && !id) el.style.cursor = "";
      hoveredId = id;
      setHighlightedPathUuid(id);
    };
    map.on("pointermove", handlePointerMove);
    return () => {
      map.un("pointermove", handlePointerMove);
      if (hoveredId) setHighlightedPathUuid(null);
    };
  }, [map, config.traverse.clickable, editActive, hitCandidate, setHighlightedPathUuid]);

  return null;
}
