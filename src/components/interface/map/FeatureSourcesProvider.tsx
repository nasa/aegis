/**
 * FeatureSourcesProvider — a provider for shared VectorSources
 *
 * A VectorSource is a OL concept that contains OL features like stations,
 * POIs, traverses, etc.
 *
 * Each `<AegisMap>` gets ONE VectorSource per feature type, shared by all the
 * behavior components mounted inside that map. A feature mutation on a source
 * triggers a redraw on every layer within that map that references it.
 *
 * On multi-map pages (the dashboard: big map + minimap), wrap EACH map in its
 * own `<FeatureSourcesProvider>` so the two maps reconcile independent sources.
 * They must NOT share one provider: both maps mount the same behavior
 * components (StationMarkers, etc.), and each reconciles its source to a
 * possibly-different set — sharing would let the last reconcile win and force
 * both maps to display the same features.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import VectorSource from "ol/source/Vector";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface FeatureSourcesContextValue {
  stationSource: VectorSource;
  traverseSource: VectorSource;
  posSource: VectorSource;
  posPathSource: VectorSource;
  circleSource: VectorSource;
  poiSource: VectorSource;
  actionSource: VectorSource;
  walkbackSource: VectorSource;
  measurementSource: VectorSource;
  highlightSource: VectorSource;
  labelSource: VectorSource;
}

const FeatureSourcesContext = createContext<FeatureSourcesContextValue | null>(null);

/** Access the shared app feature VectorSources. Must be called inside `<FeatureSourcesProvider>`. */
export function useFeatureSourcesContext(): FeatureSourcesContextValue {
  const ctx = useContext(FeatureSourcesContext);
  if (!ctx) throw new Error("useFeatureSources() must be used within <FeatureSourcesProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface FeatureSourcesProviderProps {
  children: ReactNode;
}

/**
 * Creates one VectorSource per feature type, kept alive for the lifetime of
 * the page. Wrap all `<AegisMap>` siblings in a single `<FeatureSourcesProvider>`.
 */
export function FeatureSourcesProvider({ children }: FeatureSourcesProviderProps): JSX.Element {
  const sources = useMemo<FeatureSourcesContextValue>(
    () => ({
      stationSource: new VectorSource(),
      traverseSource: new VectorSource(),
      posSource: new VectorSource(),
      posPathSource: new VectorSource(),
      circleSource: new VectorSource(),
      poiSource: new VectorSource(),
      actionSource: new VectorSource(),
      walkbackSource: new VectorSource(),
      measurementSource: new VectorSource(),
      highlightSource: new VectorSource(),
      labelSource: new VectorSource(),
    }),
    []
  );

  return (
    <FeatureSourcesContext.Provider value={sources}>{children}</FeatureSourcesContext.Provider>
  );
}
