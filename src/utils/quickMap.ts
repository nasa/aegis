export type QuickMapGeometry =
  | { type: "Point"; coordinates: [number, number]; properties?: Record<string, string> }
  | {
      type: "LineString";
      coordinates: [number, number][];
      properties?: Record<string, string>;
    }
  | { type: "Polygon"; coordinates: [number, number][]; properties?: Record<string, string> };

export interface QuickMapLinkState {
  center: AEGISPoint;
  resolutionMetersPerPixel: number;
  layerIds: string[];
  geometries: QuickMapGeometry[];
}

export interface QuickMapLinkResult {
  url: URL;
  includedGeometryCount: number;
  omittedGeometryCount: number;
}

export interface QuickMapPoint {
  location: AEGISPoint;
  properties?: Record<string, string>;
}

interface QuickMapRexPositionEntry {
  entry: PosEntry;
  primaryPosType: PosType;
}

export const QUICKMAP_BASE_URL = "https://quickmap.lroc.im-ldi.com/";
export const QUICKMAP_LAYER_IDS = ["66", "3921"];
export const QUICKMAP_RESOLUTION_METERS_PER_PIXEL = 5;
export const QUICKMAP_URL_BUDGET = 7_000;

export function getQuickMapConfig(): Pick<
  QuickMapLinkState,
  "resolutionMetersPerPixel" | "layerIds"
> & { baseUrl: string } {
  return {
    baseUrl: QUICKMAP_BASE_URL,
    layerIds: QUICKMAP_LAYER_IDS,
    resolutionMetersPerPixel: QUICKMAP_RESOLUTION_METERS_PER_PIXEL,
  };
}

export function isQuickMapPoint(
  point: AEGISPoint | null | undefined
): point is AEGISPoint & { lat: number; lng: number } {
  return (
    Number.isFinite(point?.lat) &&
    Number.isFinite(point?.lng) &&
    (point?.lat as number) >= -90 &&
    (point?.lat as number) <= 90
  );
}

export function normalizeQuickMapLongitude(longitude: number): number {
  if (longitude >= -180 && longitude <= 180) {
    return longitude;
  }
  const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && longitude > 0 ? 180 : normalized;
}

function formatCoordinate([longitude, latitude]: [number, number]): string {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error("QuickMap coordinates must be finite longitude and latitude values.");
  }
  return `${normalizeQuickMapLongitude(longitude)},${latitude}`;
}

export function hasQuickMapDistinctLineCoordinates(coordinates: [number, number][]): boolean {
  return coordinates.length >= 2 && new Set(coordinates.map(formatCoordinate)).size >= 2;
}

function formatGeometry(geometry: QuickMapGeometry): string {
  let coordinates: [number, number][];

  if (geometry.type === "Point") {
    coordinates = [geometry.coordinates];
  } else {
    coordinates = geometry.coordinates;

    if (geometry.type === "LineString") {
      if (!hasQuickMapDistinctLineCoordinates(coordinates)) {
        throw new Error("QuickMap lines require at least two distinct points.");
      }
    } else {
      const coordinateStrings = coordinates.map(formatCoordinate);
      const distinctCoordinates = new Set(coordinateStrings);
      if (coordinateStrings.length < 3 || distinctCoordinates.size < 3) {
        throw new Error("QuickMap polygons require at least three distinct points.");
      }
      if (coordinateStrings[0] !== coordinateStrings.at(-1)) {
        coordinates = [...coordinates, coordinates[0]];
      }
    }
  }

  const serializedCoordinates = coordinates.map(formatCoordinate).join(",");
  return geometry.properties
    ? `${serializedCoordinates}@@${JSON.stringify({ properties: geometry.properties })}`
    : serializedCoordinates;
}

function createBaseUrl(baseUrl: string, state: QuickMapLinkState): URL {
  if (!isQuickMapPoint(state.center)) {
    throw new Error("QuickMap requires a valid center point.");
  }
  if (!Number.isFinite(state.resolutionMetersPerPixel) || state.resolutionMetersPerPixel <= 0) {
    throw new Error("QuickMap requires a positive resolution.");
  }

  const url = new URL(baseUrl);
  url.search = "";
  url.searchParams.set("proj", "22");
  url.searchParams.set("center", formatCoordinate([state.center.lng, state.center.lat]));
  url.searchParams.set("resolution", String(state.resolutionMetersPerPixel));
  if (state.layerIds.length > 0) {
    url.searchParams.set("stack", state.layerIds.join(","));
  }
  return url;
}

export function buildQuickMapLink(baseUrl: string, state: QuickMapLinkState): QuickMapLinkResult {
  const url = createBaseUrl(baseUrl, state);
  const geometryStrings = state.geometries.map(formatGeometry);
  const includedGeometryStrings: string[] = [];
  let omittedGeometryCount = 0;

  for (const geometryString of geometryStrings) {
    const candidate = new URL(url);
    candidate.searchParams.set("features", [...includedGeometryStrings, geometryString].join("|"));
    if (candidate.toString().length <= QUICKMAP_URL_BUDGET) {
      includedGeometryStrings.push(geometryString);
    } else {
      omittedGeometryCount++;
    }
  }

  if (includedGeometryStrings.length > 0) {
    url.searchParams.set("features", includedGeometryStrings.join("|"));
  }

  return {
    url,
    includedGeometryCount: includedGeometryStrings.length,
    omittedGeometryCount,
  };
}

export function createQuickMapLinkState({
  center,
  additionalPoints = [],
  stations = [],
  traverses = [],
  defaultTraverseColor,
}: {
  center: AEGISPoint;
  additionalPoints?: QuickMapPoint[];
  stations?: Station[];
  traverses?: Traverse[];
  defaultTraverseColor?: string;
}): QuickMapLinkState {
  const { layerIds, resolutionMetersPerPixel } = getQuickMapConfig();
  const additionalPointGeometries = additionalPoints.flatMap((point): QuickMapGeometry[] => {
    if (!isQuickMapPoint(point.location)) return [];
    return [
      {
        type: "Point",
        coordinates: [point.location.lng, point.location.lat],
        properties: point.properties,
      },
    ];
  });
  const seenStationUuids = new Set<string>();
  const stationGeometries = stations.flatMap((station): QuickMapGeometry[] => {
    if (seenStationUuids.has(station.uuid) || !isQuickMapPoint(station.location)) {
      return [];
    }
    seenStationUuids.add(station.uuid);
    return [
      {
        type: "Point",
        coordinates: [station.location.lng, station.location.lat],
        properties: { title: station.name },
      },
    ];
  });
  const traverseGeometries = traverses.flatMap((traverse): QuickMapGeometry[] => {
    const coordinates = (traverse.path ?? [])
      .filter(isQuickMapPoint)
      .map((point) => [point.lng, point.lat] as [number, number]);
    const traverseColor = traverse.color || defaultTraverseColor;
    return hasQuickMapDistinctLineCoordinates(coordinates)
      ? [
          {
            type: "LineString",
            coordinates,
            properties: {
              title: traverse.name,
              ...(traverseColor ? { stroke: traverseColor, "stroke-width": "3" } : {}),
            },
          },
        ]
      : [];
  });

  return {
    center,
    resolutionMetersPerPixel,
    layerIds,
    geometries: [...additionalPointGeometries, ...stationGeometries, ...traverseGeometries],
  };
}

export function createQuickMapRexPositionLinkState({
  rex,
  landerLocation,
}: {
  rex: Rex;
  landerLocation: AEGISPoint | null | undefined;
}): QuickMapLinkState | null {
  const positionEntries: QuickMapRexPositionEntry[] = (rex.posEntries ?? [])
    .flatMap((entry) => {
      if (!isQuickMapPoint(entry.location)) return [];
      const primaryPosType = rex.posTypes.find((posType) =>
        entry.posTypeUuids.includes(posType.uuid)
      );
      return primaryPosType ? [{ entry, primaryPosType }] : [];
    })
    .sort(
      (first, second) =>
        first.entry.petSeconds - second.entry.petSeconds ||
        first.entry.createdAt - second.entry.createdAt
    );

  if (positionEntries.length === 0) return null;

  const { layerIds, resolutionMetersPerPixel } = getQuickMapConfig();
  const pointGeometries: QuickMapGeometry[] = positionEntries.map(({ entry, primaryPosType }) => ({
    type: "Point",
    coordinates: [entry.location.lng, entry.location.lat],
    properties: {
      title: primaryPosType.name,
      "marker-symbol": "circle",
      "marker-color": primaryPosType.pathColor,
    },
  }));

  const traverseGeometries = rex.posTypes.flatMap((posType): QuickMapGeometry[] => {
    const coordinates = positionEntries
      .filter(({ entry }) => entry.posTypeUuids.includes(posType.uuid))
      .map(({ entry }) => [entry.location.lng, entry.location.lat] as [number, number]);

    return hasQuickMapDistinctLineCoordinates(coordinates)
      ? [
          {
            type: "LineString",
            coordinates,
            properties: {
              title: posType.name,
              stroke: posType.pathColor,
              "stroke-width": "3",
            },
          },
        ]
      : [];
  });

  const latestPosition = positionEntries.at(-1);
  const center = latestPosition.entry.location;
  const landerGeometry: QuickMapGeometry[] = isQuickMapPoint(landerLocation)
    ? [
        {
          type: "Point",
          coordinates: [landerLocation.lng, landerLocation.lat],
          properties: { title: "Lander", "marker-color": "#ffffff" },
        },
      ]
    : [];

  return {
    center,
    resolutionMetersPerPixel,
    layerIds,
    geometries: [...landerGeometry, ...traverseGeometries, ...pointGeometries],
  };
}

export function openQuickMap(state: QuickMapLinkState): QuickMapLinkResult {
  const { baseUrl } = getQuickMapConfig();
  const result = buildQuickMapLink(baseUrl, state);
  const quickMapWindow = window.open(
    result.url.toString(),
    "aegis-quickmap",
    "popup,width=1440,height=900"
  );
  quickMapWindow?.focus();
  if (result.omittedGeometryCount > 0) {
    alert(
      `QuickMap could not include ${result.omittedGeometryCount} item${
        result.omittedGeometryCount === 1 ? "" : "s"
      } because the link exceeds its URL limit.`
    );
  }
  return result;
}
