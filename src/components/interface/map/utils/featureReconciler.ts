/**
 * Feature Reconciler — targeted add/remove/update for VectorSource features
 *
 * Instead of clearing and rebuilding all features every time state changes
 * (the Leaflet pattern), this reconciler diffs the current source contents
 * against the desired state and applies only the necessary mutations.
 *
 * Each domain item (station, POI, traverse, etc.) must have a stable `uuid`
 * used as the OL feature ID. This enables O(1) lookup via `source.getFeatureById()`.
 */

import Feature from "ol/Feature";
import type VectorSource from "ol/source/Vector";
import type { Geometry } from "ol/geom";
import type SimpleGeometry from "ol/geom/SimpleGeometry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes one desired feature from the application state.
 * The reconciler uses `id` for identity matching: if a feature with that ID
 * already exists in the source, it's updated; otherwise a new one is added.
 */
export interface FeatureDescriptor {
  /** Stable ID — maps to Feature.getId(). Must be unique within the source. */
  id: string;
  /** If provided, the feature's geometry is set/updated to this value. */
  geometry?: Geometry;
  /** Arbitrary properties to set on the feature (merged, not replaced). */
  properties?: Record<string, unknown>;
}

/**
 * Maps a domain item (e.g. Station) to a FeatureDescriptor.
 * Returning `null` means the item should not be rendered (filtered out).
 */
export type FeatureMapper<T> = (item: T) => FeatureDescriptor | null;

// ---------------------------------------------------------------------------
// Reconciler
// ---------------------------------------------------------------------------

/**
 * Reconcile a VectorSource against an array of domain items.
 *
 * - Items with no matching feature are **added**.
 * - Existing features whose item is still present are **updated** (geometry + properties).
 * - Features whose item is no longer present are **removed**.
 *
 * @param source     The OL VectorSource to reconcile.
 * @param items      Current domain items from Redux state.
 * @param mapper     Maps each domain item to a FeatureDescriptor (or null to skip).
 * @param createFeature  Factory to create a new OL Feature from a descriptor.
 *                        Defaults to a plain `new Feature()` with id and geometry set.
 */
export function reconcileFeatures<T>(
  source: VectorSource,
  items: T[],
  mapper: FeatureMapper<T>,
  createFeature?: (desc: FeatureDescriptor) => Feature<Geometry>
): void {
  // Build set of desired IDs
  const desiredById = new Map<string, FeatureDescriptor>();
  for (const item of items) {
    const desc = mapper(item);
    if (desc) desiredById.set(desc.id, desc);
  }

  // Pass 1: remove features that are no longer desired, update those that are
  const toRemove: Feature<Geometry>[] = [];
  for (const feature of source.getFeatures()) {
    const id = feature.getId() as string | undefined;
    if (!id || !desiredById.has(id)) {
      toRemove.push(feature);
      continue;
    }

    // Update existing feature
    const desc = desiredById.get(id)!;
    let didChange = false;
    if (desc.geometry) {
      const existing = feature.getGeometry();
      // Only set geometry if it actually changed (avoid unnecessary redraws)
      if (!existing || !geometryEquals(existing, desc.geometry)) {
        feature.setGeometry(desc.geometry);
        didChange = true;
      }
    }
    if (desc.properties) {
      // Only update properties that actually changed
      let propsChanged = false;
      for (const [key, value] of Object.entries(desc.properties)) {
        if (feature.get(key) !== value) {
          propsChanged = true;
          break;
        }
      }
      if (propsChanged) {
        feature.setProperties(desc.properties, /* silent */ true);
        didChange = true;
      }
    }
    // Notify OL to re-render the feature only if something actually changed
    if (didChange) {
      feature.changed();
    }

    // Mark as handled
    desiredById.delete(id);
  }

  // Remove stale features
  for (const f of toRemove) {
    source.removeFeature(f);
  }

  // Pass 2: add new features for remaining descriptors
  const factory =
    createFeature ??
    ((desc: FeatureDescriptor): Feature<Geometry> => {
      const f = new Feature(desc.geometry);
      f.setId(desc.id);
      if (desc.properties) f.setProperties(desc.properties, true);
      return f;
    });

  for (const desc of desiredById.values()) {
    source.addFeature(factory(desc));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fast shallow geometry comparison — checks type + coordinates using public OL API.
 * Avoids the cost of `.clone()` or deep comparison objects.
 */
function geometryEquals(a: Geometry, b: Geometry): boolean {
  if (a.getType() !== b.getType()) return false;
  const aCoords = JSON.stringify((a as SimpleGeometry).getCoordinates?.());
  const bCoords = JSON.stringify((b as SimpleGeometry).getCoordinates?.());
  return aCoords === bCoords;
}
