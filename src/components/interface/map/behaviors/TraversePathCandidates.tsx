/**
 * TraversePathCandidates — draws inactive Newton path options as dashed lines
 * under the active traverse paths.
 *
 * Reads rows from `TraversePathsProvider`, keeps only succeeded rows whose
 * endpoints match the traverse's current endpoints, and draws one line per
 * comparable request hash. With a traverse selected only its options are shown.
 *
 * Owns its own source and layer; non-interactive. Returns null.
 */

import { useEffect, useMemo, useRef } from "react";
import { LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";

import { refEqual, useAppSelector } from "utils/useAppSelector";
import { useMissionDocSelector } from "utils/useDocSelector";
import { groupRowsByHash, rowToCandidate, splitRowsForTarget } from "utils/traversePath";
import { useTraversePathsContext } from "components/interface/traversePaths/TraversePathsProvider";
import { traversePathOptionColor } from "components/interface/traversePaths/traversePathColors";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { reconcileFeatures, type FeatureDescriptor } from "../utils/featureReconciler";
import { buildTraversePathCandidateStyleFunction } from "../utils/styles/polylines";
import { Z_INDEX } from "../utils/zIndex";

type CandidateFeature = { candidate: TraversePathCandidate; color: string };

export function TraversePathCandidates(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const { toMapCoord } = useCoordConverters();
  const ctx = useTraversePathsContext();
  const highlightedPathUuid = ctx?.highlightedPathUuid ?? null;

  const selectedEvaSequenceItemUuid = useAppSelector(
    (s) => s.eva.selectedEvaSequenceItemUuid,
    refEqual
  );
  const planetRadius = useMissionDocSelector((m) => m.planetRadius ?? 1737400, refEqual);

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
      const { applying } = splitRowsForTarget(ctx.rowsByRefUuid[target.refUuid], target);
      groupRowsByHash(applying).forEach((group, index) => {
        const row = group.find((r) => r.status === "succeeded");
        const candidate = row ? rowToCandidate(row, planetRadius) : null;
        if (candidate) result.push({ candidate, color: traversePathOptionColor(index) });
      });
    }
    return result;
  }, [ctx, selectedEvaSequenceItemUuid, planetRadius]);

  useEffect(() => {
    const mapper = ({ candidate, color }: CandidateFeature): FeatureDescriptor => ({
      id: candidate.row.uuid,
      geometry: new LineString(candidate.path.map((p) => toMapCoord(p))),
      properties: { color, mapItemType: "traversePathCandidate" },
    });
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

  return null;
}
