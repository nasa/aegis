/**
 * Tests for `reconcileFeatures()` — the core diff/patch utility that
 * efficiently updates an OL VectorSource to match desired state.
 */

import { describe, it, expect, vi } from "vitest";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { Point, LineString } from "ol/geom";
import {
  reconcileFeatures,
  type FeatureDescriptor,
  type FeatureMapper,
} from "components/interface/map/utils/featureReconciler";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestItem {
  uuid: string;
  x: number;
  y: number;
  label?: string;
}

const mapper: FeatureMapper<TestItem> = (item) => ({
  id: item.uuid,
  geometry: new Point([item.x, item.y]),
  properties: { label: item.label ?? "" },
});

function getFeatureIds(source: VectorSource): string[] {
  return source
    .getFeatures()
    .map((f) => f.getId() as string)
    .sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reconcileFeatures", () => {
  it("adds new features to an empty source", () => {
    const source = new VectorSource();
    const items: TestItem[] = [
      { uuid: "a", x: 1, y: 2 },
      { uuid: "b", x: 3, y: 4 },
    ];

    reconcileFeatures(source, items, mapper);

    expect(source.getFeatures()).toHaveLength(2);
    expect(getFeatureIds(source)).toEqual(["a", "b"]);
  });

  it("removes stale features no longer in incoming data", () => {
    const source = new VectorSource();
    const items: TestItem[] = [
      { uuid: "a", x: 1, y: 2 },
      { uuid: "b", x: 3, y: 4 },
      { uuid: "c", x: 5, y: 6 },
    ];
    reconcileFeatures(source, items, mapper);
    expect(source.getFeatures()).toHaveLength(3);

    // Now reconcile with only "b"
    reconcileFeatures(source, [{ uuid: "b", x: 3, y: 4 }], mapper);

    expect(source.getFeatures()).toHaveLength(1);
    expect(getFeatureIds(source)).toEqual(["b"]);
  });

  it("updates geometry of existing features when coordinates change", () => {
    const source = new VectorSource();
    reconcileFeatures(source, [{ uuid: "a", x: 1, y: 2 }], mapper);

    const featureBefore = source.getFeatureById("a")!;
    const geomBefore = featureBefore.getGeometry() as Point;
    expect(geomBefore.getCoordinates()).toEqual([1, 2]);

    // Update coordinates
    reconcileFeatures(source, [{ uuid: "a", x: 10, y: 20 }], mapper);

    const featureAfter = source.getFeatureById("a")!;
    const geomAfter = featureAfter.getGeometry() as Point;
    expect(geomAfter.getCoordinates()).toEqual([10, 20]);
  });

  it("updates properties of existing features", () => {
    const source = new VectorSource();
    reconcileFeatures(source, [{ uuid: "a", x: 1, y: 2, label: "old" }], mapper);

    expect(source.getFeatureById("a")!.get("label")).toBe("old");

    reconcileFeatures(source, [{ uuid: "a", x: 1, y: 2, label: "new" }], mapper);

    expect(source.getFeatureById("a")!.get("label")).toBe("new");
  });

  it("no-ops when incoming data matches current source exactly", () => {
    const source = new VectorSource();
    const items: TestItem[] = [{ uuid: "a", x: 1, y: 2, label: "same" }];
    reconcileFeatures(source, items, mapper);

    // Spy on addFeature/removeFeature to detect unnecessary mutations
    const addSpy = vi.spyOn(source, "addFeature");
    const removeSpy = vi.spyOn(source, "removeFeature");

    reconcileFeatures(source, items, mapper);

    // No features should be added or removed (updates happen in-place)
    expect(addSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("handles empty incoming array (removes all)", () => {
    const source = new VectorSource();
    reconcileFeatures(
      source,
      [
        { uuid: "a", x: 1, y: 2 },
        { uuid: "b", x: 3, y: 4 },
      ],
      mapper
    );
    expect(source.getFeatures()).toHaveLength(2);

    reconcileFeatures(source, [], mapper);

    expect(source.getFeatures()).toHaveLength(0);
  });

  it("mapper returning null filters out items", () => {
    const source = new VectorSource();
    const filterMapper: FeatureMapper<TestItem> = (item) =>
      item.uuid === "skip" ? null : mapper(item);

    reconcileFeatures(
      source,
      [
        { uuid: "a", x: 1, y: 2 },
        { uuid: "skip", x: 0, y: 0 },
        { uuid: "b", x: 3, y: 4 },
      ],
      filterMapper
    );

    expect(source.getFeatures()).toHaveLength(2);
    expect(getFeatureIds(source)).toEqual(["a", "b"]);
  });

  it("uses custom createFeature factory when provided", () => {
    const source = new VectorSource();
    const customFactory = (desc: FeatureDescriptor) => {
      const f = new Feature(desc.geometry);
      f.setId(desc.id);
      f.set("custom", true);
      return f;
    };

    reconcileFeatures(source, [{ uuid: "a", x: 1, y: 2 }], mapper, customFactory);

    expect(source.getFeatureById("a")!.get("custom")).toBe(true);
  });

  it("handles geometry type changes", () => {
    const source = new VectorSource();
    // Start with a point
    reconcileFeatures(source, [{ uuid: "a", x: 1, y: 2 }], mapper);

    expect(source.getFeatureById("a")!.getGeometry()!.getType()).toBe("Point");

    // Switch to a line geometry via different mapper
    const lineMapper: FeatureMapper<TestItem> = (item) => ({
      id: item.uuid,
      geometry: new LineString([
        [item.x, item.y],
        [item.x + 10, item.y + 10],
      ]),
      properties: {},
    });

    reconcileFeatures(source, [{ uuid: "a", x: 1, y: 2 }], lineMapper);

    expect(source.getFeatureById("a")!.getGeometry()!.getType()).toBe("LineString");
  });
});
