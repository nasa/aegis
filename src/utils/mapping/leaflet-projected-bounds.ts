/**
 * Projected-bounds clip for Leaflet tile layers.
 *
 * Leaflet 1.9's built-in `bounds` option clips tiles in *geographic lat/lng*
 * (it derives tile bounds via `map.unproject`). For a custom projected CRS
 * (our lunar south-pole cap grid) the layer's data extent is in *projected
 * metres*, so the lat/lng clip is a no-op — every tile in the whole cap gets
 * requested, 404-storming for tiles that were never written.
 *
 * This shim adds a `projectedBounds` option ([minx, miny, maxx, maxy] in the
 * map CRS's projected units). When set, `_isValidTile` additionally rejects any
 * tile whose projected extent doesn't intersect that bbox. The tile's projected
 * extent is recovered with `crs.transformation.untransform(point, crs.scale(z))`
 * — the exact inverse Leaflet itself uses to go pixel → projected — so there is
 * no lat/lng curvature error. Layers without `projectedBounds` are unaffected.
 *
 * The override lives on `L.TileLayer.prototype`, so colorfilter tile layers
 * (which extend the same prototype) inherit it.
 */
import L from "leaflet";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const origIsValidTile = (L.TileLayer.prototype as any)._isValidTile;

L.TileLayer.include({
  _isValidTile(coords: L.Coords): boolean {
    // Preserve Leaflet's default checks (global tile range, wrapping, lat/lng bounds).
    if (!origIsValidTile.call(this, coords)) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self = this as any;
    const pb: number[] | undefined = self.options.projectedBounds;
    if (!pb || pb.length < 4) return true;

    const crs = self._map?.options?.crs;
    // Need a CRS that exposes the proj4leaflet transformation/scale to map pixels
    // back to projected coords; otherwise fall back to default behaviour.
    if (!crs?.transformation || typeof crs.scale !== "function") return true;

    const scale = crs.scale(coords.z);
    const ts = self.getTileSize();
    const nw = coords.scaleBy(ts);
    const se = nw.add(ts);
    const p1 = crs.transformation.untransform(nw, scale); // pixel → projected metres
    const p2 = crs.transformation.untransform(se, scale);

    const tMinX = Math.min(p1.x, p2.x);
    const tMaxX = Math.max(p1.x, p2.x);
    const tMinY = Math.min(p1.y, p2.y);
    const tMaxY = Math.max(p1.y, p2.y);

    // Intersect the tile's projected extent with the data bbox [minx, miny, maxx, maxy].
    return tMaxX > pb[0] && tMinX < pb[2] && tMaxY > pb[1] && tMinY < pb[3];
  },
});

export {};
