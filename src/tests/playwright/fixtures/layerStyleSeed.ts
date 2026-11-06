export const ids = {
  layer: "30000000-0000-4000-8000-000000009901",
  vector: "30000000-0000-4000-8000-000000009902",
  healthyLayer: "30000000-0000-4000-8000-000000009903",
  healthy: "30000000-0000-4000-8000-000000009904",
  missingLayer: "30000000-0000-4000-8000-000000009905",
  missing: "30000000-0000-4000-8000-000000009906",
  corruptLayer: "30000000-0000-4000-8000-000000009907",
  corrupt: "30000000-0000-4000-8000-000000009908",
  slowLayer: "30000000-0000-4000-8000-000000009909",
  slow: "30000000-0000-4000-8000-000000009910",
  presetHealthyLayer: "30000000-0000-4000-8000-000000009911",
  presetHealthy: "30000000-0000-4000-8000-000000009912",
};

export const baseStyle: MapSublayerStyle = {
  opacity: 1,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  blendMode: "normal",
  color: "#6633cc",
  weight: 2,
  fillColor: "#22aa44",
  fillOpacity: 0.25,
  isDashed: false,
  dashLen: 10,
  altColor: "#ffffff",
  altOpacity: 1,
  showLabels: true,
  labelMinZoom: 4,
};

export const mixedGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { label: "Contour 120 m", elev: 120 },
      geometry: {
        type: "LineString",
        coordinates: [
          [-0.001, 0],
          [0, 0],
          [0.001, 0],
        ],
      },
    },
    {
      type: "Feature",
      properties: { label: "Basalt unit" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-0.0008, -0.0004],
            [-0.0003, -0.0004],
            [-0.0003, 0.0001],
            [-0.0008, 0.0001],
            [-0.0008, -0.0004],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { label: "Drill point" },
      geometry: { type: "Point", coordinates: [0.0005, 0.00035] },
    },
  ],
};

export function addSublayer(doc: Mission, presetUuid: string, args: BehavioralSublayerSeed): void {
  doc.layers[args.layerUuid] = {
    uuid: args.layerUuid,
    name: args.name,
    createdAt: 1,
    updatedAt: 1,
  };
  doc.sublayers[args.uuid] = {
    uuid: args.uuid,
    layerUuid: args.layerUuid,
    type: args.type,
    name: args.name,
    description: "Small deterministic UI fixture",
    legend: args.legend ?? null,
    path: args.path,
    tilePattern: args.tilePattern ?? null,
    boundingBox: null,
    tileFormat: args.type === "tile" ? "xyz" : null,
    minNativeZoom: args.type === "tile" ? 0 : null,
    maxNativeZoom: args.type === "tile" ? 1 : null,
    maxZoom: args.type === "tile" ? 22 : null,
    isTimeBased: false,
    timeLayerManifest: [],
    createdAt: 1,
    updatedAt: 1,
  };
  doc.presets[presetUuid].layerOrder.push({
    layerUuid: args.layerUuid,
    sublayerUuids: [args.uuid],
  });
  doc.presets[presetUuid].mapSublayerControls[args.uuid] = {
    name: args.name,
    sublayerUuid: args.uuid,
    visible: args.visible,
    style: { ...baseStyle, ...args.style },
  };
}
