// IMPORTANT: use `import L from "leaflet"`, NOT `import * as L from "leaflet"`.
// The leaflet plugins below are CJS and patch `L` via `require("leaflet")`. In prod builds
// the namespace-import form resolves to a different interop wrapper, so plugin additions
// like `L.Proj` end up undefined at runtime if you don't do it correctly.
import L from "leaflet";
import "leaflet-polylinedecorator";
// side-effect: adds the `projectedBounds` tile clip to L.TileLayer
import "utils/mapping/leaflet-projected-bounds";
import type * as geojson from "geojson";
import type DraggableLines from "leaflet-draggable-lines";
import VectorTileLayer from "leaflet-vector-tile-layer";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import ReactDOMServer from "react-dom/server";
import {
  getDateAndTimeFromISOString,
  getPercentOrDefault,
  hhmmssFromSeconds,
  secondsFromhhmmss,
} from "utils/formatting";
import { EmojiRenderer } from "components/interface/emojis";
import {
  convertLeafletLatLngToAegisPoint,
  convertLeafletLatLngsToAegisPoints,
  getBoundsFromMapViewport,
  getDistanceBetweenTwoCoordinates,
} from "utils/mapping/geoMath";
import styles from "./leaflet-helper.module.css";
import type { HighlightableLayerOptions } from "leaflet-highlightable-layers";
import { HighlightablePolyline } from "leaflet-highlightable-layers";
import Color from "color";
import { antPath } from "leaflet-ant-path";
import orderBy from "lodash/orderBy";
import throttle from "lodash/throttle";
import sortBy from "lodash/sortBy";
import type { AppDispatch } from "utils/useAppDispatch";
import { setMeasureInitialCoords, updateMapDirective } from "store/map";
import { thunkUpdateMeasurementPath } from "store/thunk/thunkMeasurement";
import { thunkDocUpdateWalkback, thunkDocUpdateStationLocation } from "store/thunk/thunkStation";
import { thunkDocUpdateTraverse } from "store/thunk/thunkTraverse";
import { thunkDocUpdateActionLocation } from "store/thunk/thunkAction";
import { thunkDocUpdateLanderLocation } from "store/thunk/thunkMission";
import { thunkDocUpdatePoiLocation } from "store/thunk/thunkPoi";
import { thunkDocUpdatePosEntryWithLocation } from "store/thunk/thunkRexPosEntry";
import { EARTH_RADIUS } from "utils/consts";
import { checkTimeInBounds, matchTimeToManifest } from "utils/mapping/timeLayers";

// make color filter settings for tile sublayer. This is the format of leaflet.tilelayer.colorfilter package
export const makeTileLayerColorFilter = (mapSublayerControl: MapSublayerControl): string[] => {
  return [
    `brightness:${getPercentOrDefault(mapSublayerControl.style?.brightness)}%`,
    `contrast:${getPercentOrDefault(mapSublayerControl.style?.contrast)}%`,
    `opacity:${getPercentOrDefault(mapSublayerControl.style?.opacity)}%`,
    `saturate:${getPercentOrDefault(mapSublayerControl.style?.saturation)}%`,
  ];
};

export const isLayerOnMapByName = (map: MutableRefObject<L.Map>, name: string): boolean => {
  let layerFound = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.current.eachLayer((layer: any) => {
    if (layer.options.id === name) layerFound = true;
  });
  return layerFound;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getLayerByName = (map: MutableRefObject<L.Map>, name: string): any => {
  let returnVal = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.current.eachLayer((layer: any) => {
    if (layer.options.id === name) returnVal = layer;
  });
  return returnVal;
};

/**
 * Get the map item by uuid
 * Optionally provide a test for mapItemType as well
 */
export const getMapItemByUuid = (
  map: MutableRefObject<L.Map>,
  uuid: string,
  mapItemType?: MapItemType
): AEGISMarker | AEGISPolyline => {
  let mapItem: AEGISMarker | AEGISPolyline = null;

  map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
    if (layer.uuid === uuid) {
      if (mapItemType && layer.mapItemType !== mapItemType) return null;
      mapItem = layer;
    }
  });
  return mapItem;
};

export const drawSelectedMarker = (
  map: MutableRefObject<L.Map>,
  highlightLocation: AEGISPoint
): void => {
  if (isNaN(highlightLocation.lat) || isNaN(highlightLocation.lng)) return;

  const latLng = new L.LatLng(highlightLocation.lat, highlightLocation.lng);

  // create a circle marker that is a white dotted stroke with no fill
  const marker = L.circleMarker(latLng, {
    radius: 25,
    color: "#ffffff",
    stroke: true,
    weight: 1,
    opacity: 1,
    fill: false,
    dashArray: "5, 5",
  }) as AEGISCircleMarker;
  marker.mapItemType = "selected";
  marker.bringToBack();

  map.current.addLayer(marker);
};

/**
 * calculate the scale and generate the jsx for the drawing
 * @param map the map ref
 * @param planetRadius mission planet radius
 * @returns
 */
export const scaleBarDiv = (
  map: MutableRefObject<L.Map>,
  planetRadius: number,
  scaleValueClassName?: string
): JSX.Element => {
  if (!map.current || !planetRadius) return;
  const center = map.current.getCenter();
  const pointC = map.current.latLngToContainerPoint(center);
  const pointX: L.PointExpression = [pointC.x + 100, pointC.y]; //measure scale for 100 pixels(?)
  const latLngC = map.current.containerPointToLatLng(pointC);
  const latLngX = map.current.containerPointToLatLng(pointX);
  const distance = getDistanceBetweenTwoCoordinates(
    convertLeafletLatLngToAegisPoint(latLngC),
    convertLeafletLatLngToAegisPoint(latLngX),
    planetRadius
  );
  const scale = distance;

  // round up the scale value to the nearest custom meter marks. Ex: if scale is 51 it will round to 100.
  let roundedScale: number;
  const meters = [1, 2, 5, 10, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  for (const meter of meters) {
    roundedScale = Math.ceil(scale / meter) * meter;
    if (scale < meter) {
      break;
    }
  }
  // if it's over 1000m, turn the label into km
  const roundedScaleLabel = roundedScale >= 1000 ? `${roundedScale / 1000} km` : `${roundedScale}m`;

  // determine how wide to draw the scale bar
  // scale / 100 = roundedScale / x
  const scaleBarSize = roundedScale / (scale / 100);

  return (
    <div className={`${scaleValueClassName}`} style={{ width: scaleBarSize }}>
      {roundedScaleLabel}
    </div>
  );
};

/**
 * Draw the lat lng mouse position
 * @param mousePosition
 * @returns
 */
export const latLngDiv = (mouseLatLng: AEGISPoint): JSX.Element => {
  const latLngStr = `${mouseLatLng.lat.toFixed(6)}, ${mouseLatLng.lng.toFixed(6)}`;
  return (
    <>
      <div className={styles.positionValue}>{latLngStr}</div>
    </>
  );
};

/**
 * Draw time for a layer
 * @param layerTimeUsed
 * @returns
 */
export const layerTimeDiv = (layerTimeUsed: TimeLayerInfo): JSX.Element => {
  return (
    <div className={styles.positionValue}>
      {getDateAndTimeFromISOString(layerTimeUsed.datetime).join(" ")}
      {" UTC"}
    </div>
  );
};

/**
 * Draw the mouse coordinate
 * @param mouseCoord
 * @returns
 */
export const mouseGridCoordDiv = (mouseCoord: string): JSX.Element => {
  return (
    <>
      <div className={styles.gridCoordValue}>{mouseCoord}</div>
    </>
  );
};

/**
 * calculate the initial coords for where new measure tool lines will be initially drawn
 */
export const calcMeasureToolInitialCoords = (map: MutableRefObject<L.Map>): AEGISPoint[] => {
  // set measureInitialCoords to 1/3 of the way to the top left of the map and 1/3 of the way to the top right of the map
  const mapSize = map.current.getSize();
  const mapTopLeft = convertLeafletLatLngToAegisPoint(
    map.current.containerPointToLatLng([0 + mapSize.x / 3, 0 + mapSize.y / 3])
  );
  const mapTopRight = convertLeafletLatLngToAegisPoint(
    map.current.containerPointToLatLng([mapSize.x - mapSize.x / 3, 0 + mapSize.y / 3])
  );
  return [mapTopLeft, mapTopRight];
};

/**
 * Draw or update markers on the map
 */
export const drawOrUpdateMarkerOnMap = async ({
  map,
  featureGroup,
  name,
  uuid,
  iconEmoji,
  location,
  mapItemType,
  isWin10,
  onClick = () => {},
  onDragEnd = () => {},
  onMouseOver = () => {},
  onMouseOut = () => {},
  markerOptions = {},
  tooltipOptions = {},
  iconClassName,
  iconWin10ClassName,
  iconWrapperClassName,
}: {
  map: MutableRefObject<L.Map>;
  featureGroup?: MutableRefObject<L.FeatureGroup>;
  name: string;
  uuid: string;
  iconEmoji: string;
  location: AEGISPoint;
  mapItemType: MapMarkerType;
  isWin10: boolean;
  onClick?: () => void;
  onDragEnd?: (marker: AEGISMarker) => void;
  onMouseOver?: (markerUuid: string) => void;
  onMouseOut?: () => void;
  markerOptions?: L.MarkerOptions;
  tooltipOptions?: L.TooltipOptions;
  iconClassName?: string;
  iconWin10ClassName?: string;
  iconWrapperClassName?: string;
}): Promise<void> => {
  if (isNaN(location.lat) || isNaN(location.lng)) return;

  const html = ReactDOMServer.renderToString(
    <div className={`${styles.iconWrapper} ${iconWrapperClassName}`}>
      <div
        className={`${isWin10 ? styles.mapIconWin10 : styles.mapIcon} ${isWin10 ? iconWin10ClassName : iconClassName}`}
      >
        <EmojiRenderer iconValue={iconEmoji} customSizeEm={1.8} />
      </div>
    </div>
  );

  const icon = L.divIcon({ html });

  const existingLayer = getMapItemByUuid(map, uuid, mapItemType) as AEGISMarker;

  if (existingLayer && existingLayer.mapItemType === mapItemType) {
    existingLayer.setLatLng(location as L.LatLng);
    existingLayer.setIcon(icon);
  } else {
    const marker = L.marker(location as AEGISPoint, {
      icon,
      ...markerOptions,
    }) as AEGISMarker;
    marker.uuid = uuid;
    marker.mapItemType = mapItemType;

    // marker handlers
    marker.bindTooltip(`${name}`, {
      sticky: false,
      direction: "top",
      offset: new L.Point(0, -20),
      className: "leaflet-tooltip-own",
      ...tooltipOptions,
    });
    if (onClick) {
      marker
        .on("click", () => {
          onClick();
        })
        .on("mouseover", () => {
          onMouseOver(marker.uuid);
        })
        .on("mouseout", () => {
          onMouseOut();
        });
    }
    if (onDragEnd) {
      // dragend handler that causes edit to be saved on mouseup
      marker.on("dragend", (e) => {
        map.current.getContainer().style.cursor = "grab";
        onDragEnd(e.target as AEGISMarker);
      });
    }

    if (mapItemType === "station") {
      marker.setZIndexOffset(2000);
    }
    if (featureGroup) {
      featureGroup.current.addLayer(marker);
    } else {
      // lander does not have a feature group
      map.current.addLayer(marker);
    }
  }
};

export const drawLanderOnMap = async ({
  map,
  location,
  onClick = () => {},
  onDragEnd = () => {},
  tooltipOptions = {},
  sizePx = 30,
}: {
  map: MutableRefObject<L.Map>;
  location: AEGISPoint;
  onClick?: () => void;
  onDragEnd?: (marker: AEGISMarker) => void;
  tooltipOptions?: L.TooltipOptions;
  sizePx?: number;
}): Promise<void> => {
  if (isNaN(location.lat) || isNaN(location.lng)) return;

  const name = "Lander";
  const uuid = "lander";

  const icon = L.icon({
    iconUrl: "/images/lander.svg",
    iconSize: [sizePx, sizePx],
    iconAnchor: [sizePx / 2, sizePx / 2],
  });

  const existingLayer = getMapItemByUuid(map, uuid, "lander") as AEGISMarker;

  if (existingLayer && existingLayer.mapItemType === "lander") {
    existingLayer.setLatLng(location as L.LatLng);
    existingLayer.setIcon(icon);
  } else {
    const marker = L.marker(location as AEGISPoint, {
      icon: icon,
    }) as AEGISMarker;
    marker.uuid = uuid;
    marker.mapItemType = "lander";

    // marker handlers
    marker.bindTooltip(`${name}`, {
      sticky: false,
      direction: "top",
      offset: new L.Point(0, -20),
      className: "leaflet-tooltip-own",
      ...tooltipOptions,
    });

    if (onClick) {
      marker.on("click", () => {
        onClick();
      });
    }

    if (onDragEnd) {
      // dragend handler that causes edit to be saved on mouseup
      marker.on("dragend", (e) => {
        map.current.getContainer().style.cursor = "grab";
        onDragEnd(e.target as AEGISMarker);
      });
    }

    // lander does not have a feature group
    map.current.addLayer(marker);
  }
};

/**
 * Draw polylines on the map
 */
export const drawPolylineOnMap = ({
  map,
  name,
  uuid,
  path,
  color,
  mapItemType,
  showArrows,
  onClick = () => {},
  onMouseOver = () => {},
  onMouseOut = () => {},
  tooltipOptions = {},
  polylineOptions,
  dashArray,
  arrowPatternProp,
  arrowHeadOptions,
  antPathWeight,
}: {
  map: MutableRefObject<L.Map>;
  name: string;
  uuid: string;
  path: AEGISPoint[];
  color: string;
  mapItemType: MapPolylineType;
  showArrows: boolean;
  onClick?: () => void;
  onMouseOver?: (polylineUuid: string) => void;
  onMouseOut?: () => void;
  tooltipOptions?: L.TooltipOptions;
  polylineOptions?: HighlightableLayerOptions<L.PolylineOptions>;
  dashArray?: string;
  arrowPatternProp?: Partial<L.Pattern>;
  arrowHeadOptions?: L.Symbol.ArrowHeadOptions;
  antPathWeight?: number;
}): void => {
  // if the location isn't the null default, draw it on the map
  if (
    !Array.isArray(path) ||
    !path[0]?.lat ||
    !path[0]?.lng ||
    !path[path.length - 1]?.lat ||
    !path[path.length - 1]?.lng
  )
    return;
  for (let i = 0; i < path.length; i++) {
    if (isNaN(path[i].lat) || isNaN(path[i].lng)) return;
  }

  const typeName = mapItemType.charAt(0).toUpperCase() + mapItemType.slice(1);
  const selectedColor = Color(color).lighten(0.5).hex();
  const opacity = 0.75;

  const polyline = new HighlightablePolyline(path as AEGISPoint[], {
    color,
    dashArray,
    opacity,
    smoothFactor: 1,
    outlineColor: selectedColor,
    raised: false,
    ...polylineOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any; //TODO: figure out the weird HighlightablePolyline typescript implementation
  polyline.uuid = uuid;
  polyline.mapItemType = mapItemType;

  // polyline handlers
  polyline
    .bindTooltip(`${name} ${typeName}`, {
      sticky: true,
      direction: "top",
      offset: new L.Point(0, -20),
      ...tooltipOptions,
    })
    .on("click", () => {
      onClick();
    })
    .on("mouseover", () => {
      onMouseOver(polyline.uuid);
    })
    .on("mouseout", () => {
      onMouseOut();
    });

  map.current.addLayer(polyline);

  // draw arrows on the path
  const arrowPattern: L.Pattern[] = [
    {
      offset: 20,
      endOffset: 20,
      repeat: 70,
      symbol: L.Symbol.arrowHead({
        pixelSize: 20,
        polygon: true,
        pathOptions: {
          stroke: false,
          fill: true,
          fillColor: color,
          fillOpacity: opacity,
        },
        ...arrowHeadOptions,
      }),
      ...arrowPatternProp,
    },
  ];
  if (mapItemType === "traverse") {
    // *only* traverses can be either arrow or antpath
    if (showArrows) {
      const arrows = L.polylineDecorator(polyline, {
        patterns: arrowPattern,
      }) as unknown as AEGISDecorator;
      arrows.uuid = uuid + "Arrows";
      arrows.mapItemType = mapItemType;
      map.current.addLayer(arrows);
    } else {
      const aPath = antPath(path, {
        delay: 9000,
        dashArray: [10, 20],
        weight: antPathWeight || 4,
        opacity: 0.5,
        color: "rgb(0, 0, 0, 0)",
        pulseColor: "rgb(255, 255, 255, 1)",
        paused: false,
        reverse: false,
        hardwareAccelerated: true,
      });
      aPath.mapItemType = "traverse" as MapItemType;
      aPath.uuid = uuid + "Antpath";
      map.current.addLayer(aPath);
    }
  } else {
    // arrows for all other polyline types (walkbacks)
    const arrows = L.polylineDecorator(polyline, {
      patterns: arrowPattern,
    }) as unknown as AEGISDecorator;
    arrows.uuid = uuid + "Arrows";
    arrows.mapItemType = mapItemType;
    map.current.addLayer(arrows);
  }
};

/**
 * Update polyline on map (used to redraw line when snapping endpoints)
 */
export const updatePolylineOnMap = ({
  map,
  uuid,
  path,
  mapItemType,
}: {
  map: MutableRefObject<L.Map>;
  uuid: string;
  path: AEGISPoint[];
  mapItemType: MapPolylineType;
}): void => {
  if (
    !Array.isArray(path) ||
    !path[0]?.lat ||
    !path[0]?.lng ||
    !path[path.length - 1]?.lat ||
    !path[path.length - 1]?.lng
  )
    return;
  for (let i = 0; i < path.length; i++) {
    if (isNaN(path[i].lat) || isNaN(path[i].lng)) return;
  }

  const existingLayer = getMapItemByUuid(map, uuid, mapItemType) as AEGISPolyline;

  if (existingLayer && existingLayer.mapItemType === mapItemType) {
    existingLayer.setLatLngs(path);
  }
};

/**
 * Draw or update pos path on the map. Serves as draw when page loads
 */
export const drawPosPathOnMap = ({
  posEntryFeatureGroup,
  coords,
  uuid,
  polylineOptions,
}: {
  posEntryFeatureGroup: MutableRefObject<L.FeatureGroup>;
  coords: AEGISPoint[]; // array of path coordinates
  uuid: string; // uuid for this path
  polylineOptions?: L.PolylineOptions;
}): void => {
  const path = L.polyline(coords, {
    smoothFactor: 1,
    interactive: false,
    ...polylineOptions,
  }) as AEGISPolyline;

  path.uuid = uuid;
  path.mapItemType = "posPath";
  posEntryFeatureGroup.current.addLayer(path);

  // add arrows to polyline
  const arrows = L.polylineDecorator(path, {
    patterns: [
      {
        offset: 10,
        endOffset: 10,
        repeat: 100,
        symbol: L.Symbol.arrowHead({
          pixelSize: 14,
          polygon: true,
          pathOptions: {
            stroke: false,
            fill: true,
            fillColor: polylineOptions.color,
            fillOpacity: polylineOptions.opacity,
          },
        }),
      },
    ],
  }) as unknown as AEGISDecorator;
  arrows.uuid = uuid + "Arrows";
  arrows.mapItemType = "posPath";
  posEntryFeatureGroup.current.addLayer(arrows);
};

/**
 * Draw a pos marker on the map. Serves as draw when page loads
 */
export const drawPosMarkerOnMap = async ({
  map,
  posEntry,
  posEntryFeatureGroup,
  selectedOrRunningRex,
  isWin10,
  showOldMarkers,
  showLatestLabels,
  rexPetTime,
  markerOptions = {},
  tooltipOptions = {},
  onClick = () => {},
  onDragEnd = () => {},
  onMouseOver = () => {},
  onMouseOut = () => {},
  overridePosTypesUuidsToDraw,
  iconClassName,
  iconWin10ClassName,
  iconWrapperClassName,
  barClassName,
  overrideEVIcon = false,
  miniMap = false,
  barOffset = 5,
}: {
  map: MutableRefObject<L.Map>;
  posEntry: PosEntry;
  posEntryFeatureGroup: MutableRefObject<L.FeatureGroup>;
  selectedOrRunningRex: Rex;
  isWin10: boolean;
  showOldMarkers: boolean;
  showLatestLabels: boolean;
  rexPetTime: string;
  markerOptions?: L.MarkerOptions;
  tooltipOptions?: L.TooltipOptions;
  onClick?: () => void;
  onDragEnd?: (marker: AEGISMarker) => void;
  onMouseOver?: (markerUuid: string) => void;
  onMouseOut?: () => void;
  overridePosTypesUuidsToDraw?: string[]; //optional custom pos types to draw if we don't want to draw all the ones in posEntry
  iconClassName?: string;
  iconWin10ClassName?: string;
  iconWrapperClassName?: string;
  barClassName?: string;
  overrideEVIcon?: boolean; // whether or not to show the custom SVG icon for astronauts. Pos type name must start with "EV"
  miniMap?: boolean; // mini map flag to determine styling
  barOffset?: number;
}): Promise<void> => {
  const uuid = posEntry.uuid;
  const location = posEntry.location;
  if (!selectedOrRunningRex || isNaN(posEntry?.location?.lat) || isNaN(posEntry?.location?.lng))
    return;
  const mapItemType: MapItemType = "posEntry";

  const posTypeUuids = selectedOrRunningRex.posTypes
    .filter((posType) => posEntry.posTypeUuids.includes(posType.uuid))
    .map((posType) => posType.uuid);

  const makeIconFromPosTypeUuid = (posTypeUuid: string, count: number): JSX.Element => {
    const entryPosType = selectedOrRunningRex.posTypes?.find(
      (posType) => posType.uuid === posTypeUuid
    );

    const jsx =
      overrideEVIcon && entryPosType.name.substring(0, 2) === "EV" ? (
        // draw custom SVG icon for EVs. On the mini map, make it smaller - apply small offset for stacking
        <div
          className={miniMap ? styles.mapEVIconMinimap : styles.mapEVIcon}
          style={{
            transform: `translate(calc(-50% + ${count * 2}px), 0px)`,
          }}
          key={`icon_${posTypeUuid}`}
        >
          <img
            style={{
              width: miniMap ? "20px" : "30px",
            }}
            src="/images/astronaut_outline.svg"
          ></img>
        </div>
      ) : (
        // draw the emoji as is - use count offset for stacking
        <div
          className={`${isWin10 ? styles.posIconWin10 : styles.posIcon} ${isWin10 ? iconWin10ClassName : iconClassName}`}
          style={{ left: count * 2, top: count * 2 }}
          key={`icon_${posTypeUuid}`}
        >
          <EmojiRenderer iconValue={entryPosType?.icon} />
        </div>
      );

    return jsx;
  };

  const getColorFromPosTypeUuid = (posTypeUuid: string): string => {
    const entryPosType = selectedOrRunningRex.posTypes?.find(
      (posType) => posType.uuid === posTypeUuid
    );
    return entryPosType?.pathColor;
  };

  // draw emojis
  const posTypeUuidsEmojisToShow = showOldMarkers
    ? posTypeUuids
    : overridePosTypesUuidsToDraw || posTypeUuids;

  // Don't create marker if there's nothing to show
  if (!posTypeUuidsEmojisToShow || posTypeUuidsEmojisToShow.length === 0) {
    return null;
  }

  // draw icons and bars. draw icons in reverse order so the first one is on top
  const jsx = (
    <div className={`${styles.iconWrapper} ${iconWrapperClassName}`}>
      {posTypeUuidsEmojisToShow?.length > 0 &&
        posTypeUuidsEmojisToShow
          .slice(0)
          .reverse()
          .map((posTypeUuid, index, posTypesToDraw) =>
            makeIconFromPosTypeUuid(posTypeUuid, posTypesToDraw.length - index - 1)
          )}
      {posTypeUuidsEmojisToShow?.map((posTypeUuid, index) => (
        <div
          key={`bar_${index}`}
          className={`${styles.posBar} ${barClassName}`}
          style={{
            top: `${index * barOffset}px`,
          }}
        >
          <div
            className={styles.posBarItem}
            style={{ backgroundColor: getColorFromPosTypeUuid(posTypeUuid) }}
          ></div>
        </div>
      ))}
    </div>
  );
  const html = ReactDOMServer.renderToString(jsx);
  const icon = L.divIcon({ html });

  // create leaflet marker object
  const marker = L.marker(location as AEGISPoint, {
    icon,
    zIndexOffset: 5000,
    ...markerOptions,
  }) as AEGISMarker;
  marker.uuid = uuid;
  marker.mapItemType = mapItemType;

  // create tooltip
  marker.bindTooltip(``, {
    sticky: false,
    direction: "top",
    offset: new L.Point(0, -20),
    className: "leaflet-tooltip-own",
    ...tooltipOptions,
  });

  // if the rex is NOT running, build the tooltip.
  // if the rex is running, the tooltip will be generated by the ticking useEffect
  if (!selectedOrRunningRex.isRunning) {
    const markerPosTypeAbbrs: string[] = [];
    const posTypeUuidsLabelsToShow = showLatestLabels
      ? overridePosTypesUuidsToDraw || posTypeUuids
      : posTypeUuids;

    for (const posTypeUuid of posTypeUuidsLabelsToShow) {
      const posTypeAbbr = selectedOrRunningRex?.posTypes?.find(
        (posTypeFromRex) => posTypeFromRex.uuid === posTypeUuid
      )?.abbr;
      markerPosTypeAbbrs.push(posTypeAbbr);
    }

    const rexPetSeconds = secondsFromhhmmss(rexPetTime);
    const timeToShow = hhmmssFromSeconds(rexPetSeconds - posEntry.petSeconds);
    const newLabel = `${timeToShow} / ${markerPosTypeAbbrs}`;
    marker.setTooltipContent(newLabel);
  }

  // marker handlers
  marker
    .on("click", () => {
      onClick();
    })
    .on("mouseover", () => {
      onMouseOver(marker.uuid);
    })
    .on("mouseout", () => {
      onMouseOut();
    });
  if (onDragEnd) {
    // dragend handler that causes edit to be saved on mouseup
    marker.on("dragend", (e) => {
      map.current.getContainer().style.cursor = "grab";
      onDragEnd(e.target as AEGISMarker);
    });
  }
  posEntryFeatureGroup.current.addLayer(marker);
};

/**
 * Check sublayer's time status
 */
export const addSublayerToLayersToAdd = ({
  sublayer,
  layersToAdd,
  mapDateTime,
}: {
  sublayer: Sublayer;
  layersToAdd: SublayerToDraw[];
  mapDateTime: string;
}): TimeLayerInfo => {
  let sublayerTimeInfo: TimeLayerInfo = null;
  let sublayerTimePath = sublayer.path;
  if (sublayer.isTimeBased) {
    sublayerTimeInfo = matchTimeToManifest(mapDateTime, sublayer.timeLayerManifest);
    sublayerTimePath = `${sublayer.path}/${sublayerTimeInfo.dirName}`;
    if (!checkTimeInBounds(mapDateTime, sublayerTimeInfo.lowerBound, sublayerTimeInfo.upperBound)) {
      sublayerTimeInfo = null;
      sublayerTimePath = null;
    }
  }
  layersToAdd.push({
    ...sublayer,
    chosenTimeLayer: sublayerTimeInfo,
    path: sublayerTimePath,
  }); //add sublayer
  return sublayerTimeInfo;
};

/**
 * Get all the layers we need to draw on the map
 */
export const getLayersToAddInOrder = ({
  selectedPreset,
  missionSublayers,
  missionLayers,
  mapDateTime,
  setTimeLayerInfo,
}: {
  selectedPreset: Preset;
  missionSublayers: Sublayer[];
  missionLayers: Layer[];
  mapDateTime: string;
  setTimeLayerInfo: Dispatch<SetStateAction<TimeLayerInfo>>;
}): SublayerToDraw[] => {
  // go through all layers in mission config,  add make a list of the ones that are visible
  const layersToAdd: SublayerToDraw[] = [];
  let timeLayerInfoToSave = undefined;

  //build layer list
  //loop through layers in the preset in order
  if (selectedPreset.layerOrder) {
    for (const headerLayer of selectedPreset.layerOrder) {
      //loop through the sublayer uuids
      for (const sublayerUuid of headerLayer.sublayerUuids) {
        //check if sublayer is toggled visible in the preset
        if (selectedPreset.mapSublayerControls[sublayerUuid]?.visible) {
          //this layer is visible - get the sublayer object from mission
          const sublayer = missionSublayers.find((sublayer) => sublayer.uuid === sublayerUuid);
          const sublayerTimeInfo = addSublayerToLayersToAdd({ sublayer, layersToAdd, mapDateTime }); //add sublayer
          if (sublayerTimeInfo) {
            timeLayerInfoToSave = sublayerTimeInfo;
          }
        }
      }
    }
  } else {
    //preset does not have ordering, sort by name
    for (const layer of sortBy(missionLayers, [(layer) => layer.name.toLowerCase()])) {
      for (const sublayer of sortBy(
        missionSublayers.filter((s) => s.layerUuid === layer.uuid),
        [(sublayer) => sublayer.name.toLowerCase()]
      )) {
        if (selectedPreset.mapSublayerControls[sublayer.uuid].visible) {
          const sublayerTimeInfo = addSublayerToLayersToAdd({ sublayer, layersToAdd, mapDateTime }); //add sublayer
          if (sublayerTimeInfo) {
            timeLayerInfoToSave = sublayerTimeInfo;
          }
        }
      }
    }
  }

  if (setTimeLayerInfo) {
    setTimeLayerInfo(timeLayerInfoToSave);
  }
  // reverse the array to add the ones at the bottom of the tree first
  return layersToAdd.reverse();
};

/**
 * Draw map layers
 */
export const drawLayersOnMap = ({
  map,
  mapSublayerControls,
  layersToAddInOrder,
  missionId,
  mapTime,
  setGridLabels,
}: {
  map: MutableRefObject<L.Map>;
  mapSublayerControls: MapSublayerControls;
  layersToAddInOrder: SublayerToDraw[];
  missionId: number;
  mapTime: string;
  setGridLabels: Dispatch<SetStateAction<GridLabelItem[]>>;
}): void => {
  // Loop through layersToAddInOrder
  // remove map layers that are not visible in layerControls
  map.current.eachLayer((leafletLayer) => {
    const uuid =
      (leafletLayer as L.TileLayer).options.uuid || (leafletLayer as L.FeatureGroup).uuid;
    const layerTimeInfo =
      (leafletLayer as L.TileLayer).options.timeInfo || (leafletLayer as L.FeatureGroup)?.timeInfo;
    const sublayerControls = mapSublayerControls[uuid];
    if (sublayerControls && !sublayerControls.visible) {
      map.current.removeLayer(leafletLayer);

      // remove grid labels if grid layer is removed
      //TODO: this is a hacky way to check if it's a grid layer
      if (sublayerControls.name.includes("Grid") && setGridLabels) {
        setGridLabels([]);
      }
      // Remove time-based layers when a time is not set or when the map time lies outside of layer time bounds
    } else if (
      layerTimeInfo &&
      (!mapTime || !checkTimeInBounds(mapTime, layerTimeInfo.lowerBound, layerTimeInfo.upperBound))
    ) {
      map.current.removeLayer(leafletLayer);
    }
  });

  // check map layers in order
  // if layer is time based and does not have a map time set, do not draw it
  const layerBaseURL = "/static/missionFiles";
  // Custom (projected) CRS missions store sublayer.boundingBox in projected units.
  // Leaflet's `bounds` option clips in lat/lng, so for these we clip in projected
  // space via `projectedBounds` instead (see leaflet-projected-bounds.ts).
  const isProjCrs = !!L.Proj && map.current.options.crs instanceof L.Proj.CRS;
  layersToAddInOrder
    .filter((sublayer) => !sublayer.isTimeBased || sublayer.chosenTimeLayer)
    .map((sublayer, index) => {
      // If a sublayer is time-based, find what time should draw
      const sublayerTimeInfo: TimeLayerInfo = sublayer.isTimeBased
        ? sublayer.chosenTimeLayer
        : null;
      const isExternal = sublayer.path?.startsWith("http");
      if (sublayer.type === "tile") {
        // if layer isn't already on the map, add it
        const colorFilter = makeTileLayerColorFilter(mapSublayerControls[sublayer.uuid]);
        if (!isLayerOnMapByName(map, sublayer.name)) {
          const tilePath = isExternal
            ? `${sublayer.path}/${sublayer.tilePattern}`
            : `${layerBaseURL}/${missionId}/Layers/${sublayer.path}/${sublayer.tilePattern}`;

          const tileLayer = L.tileLayer(tilePath, {
            //manually add id and type fields for tracking later on
            id: sublayer.name,
            uuid: sublayer.uuid,
            type: "tile",
            tileSize: 256,
            // For custom projected CRS missions the boundingBox is in projected units,
            // so clip in projected space; otherwise use Leaflet's lat/lng bounds.
            ...(isProjCrs
              ? { projectedBounds: sublayer.boundingBox }
              : {
                  bounds: [
                    [sublayer.boundingBox[1], sublayer.boundingBox[0]],
                    [sublayer.boundingBox[3], sublayer.boundingBox[2]],
                  ] as L.LatLngBoundsExpression,
                }),
            tms: sublayer.tileFormat === "tms",
            minZoom: sublayer.minNativeZoom || 1,
            minNativeZoom: sublayer.minNativeZoom,
            maxZoom: sublayer.maxZoom,
            maxNativeZoom: sublayer.maxNativeZoom,
            opacity: mapSublayerControls[sublayer.uuid].style?.opacity,
            zIndex: index,
            colorFilter,
            // custom class name that we use to control mix-blend-mode
            className: `leaflet-layer leaflet-blend-${
              mapSublayerControls[sublayer.uuid].style?.blendMode
            }`,
            timeInfo: sublayerTimeInfo,
          });

          map.current.addLayer(tileLayer);
          tileLayer.bringToFront();
        } else {
          // if layer is already on the map, bring it to the front. This has the effect of controlling z-order of layers
          const layer: L.TileLayer = getLayerByName(map, sublayer.name);
          // set all the options for the layer that are in the mapSublayerControls
          layer.setOpacity(mapSublayerControls[sublayer.uuid].style?.opacity);
          layer.updateColorFilter(colorFilter);

          layer.bringToFront();
        }
      } else if (sublayer.type === "vector") {
        // if layer isn't already on the map, add it
        if (!isLayerOnMapByName(map, sublayer.name)) {
          // fetch geojson object from url
          const geoJsonPath = isExternal
            ? `${sublayer.path}`
            : `${layerBaseURL}/${missionId}/Data/${sublayer.path}`;

          const fetchGeojsonAsync = async () => {
            const res = await fetch(geoJsonPath, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            });
            const geojson = await res.json();

            // create a featureGroup for the layer
            const featureGroup = L.featureGroup();
            featureGroup.name = sublayer.name;
            featureGroup.uuid = sublayer.uuid;
            featureGroup.timeInfo = sublayerTimeInfo;

            const newGridLabels: GridLabelItem[] = [];

            const gridLayerOnEachFeature = (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              feature: geojson.Feature<geojson.GeometryObject, any>
            ) => {
              if (feature.properties["MGRS_UTM"]) {
                // if this grid has a MGRS_UTM property, that means it was made via MGRS process (for earth things like JETT 5).

                // Look for the MGRS_Corner value to tell us where the bottom left coordinate is.
                // If it doens't exist, then just use the 2nd coordinate
                const bottomLeftCoordinate = feature.properties["MGRS_Corner"]
                  ? feature.properties["MGRS_Corner"]
                  : 1;

                if (feature.properties["CELL_ID"]) {
                  const multiPolygon = feature.geometry as geojson.MultiPolygon;
                  const latLng = new L.LatLng(
                    multiPolygon.coordinates[0][0][bottomLeftCoordinate][1],
                    multiPolygon.coordinates[0][0][bottomLeftCoordinate][0]
                  );

                  const cellid = feature.properties["CELL_ID"];
                  newGridLabels.push({
                    id: cellid,
                    latLng: { lat: latLng.lat, lng: latLng.lng },
                  });
                }
              } else {
                // No MGRS_UTM property, that means it's a bespoke grid made by the ARES GIS team, this means the 4th coordinate is the bottom left
                // x y is flipped if it's bespoke made by the ARES GIS team
                const bottomLeftCoordinate = 3;
                const cellid = `${feature.properties["CELL_ID"].split(" ")[1]} ${
                  feature.properties["CELL_ID"].split(" ")[0]
                } `;
                if (feature.properties["CELL_ID"]) {
                  const multiPolygon = feature.geometry as geojson.MultiPolygon;
                  const latLng = new L.LatLng(
                    multiPolygon.coordinates[0][0][bottomLeftCoordinate][1],
                    multiPolygon.coordinates[0][0][bottomLeftCoordinate][0]
                  );
                  newGridLabels.push({
                    id: cellid,
                    latLng: { lat: latLng.lat, lng: latLng.lng },
                  });
                }
              }
            };

            const vectorLayer = L.geoJSON(geojson, {
              style: (geoJsonFeature) => {
                //fill color defaults to color if not defined
                let fillColor = mapSublayerControls[sublayer.uuid].style?.color;
                if (mapSublayerControls[sublayer.uuid].style?.fillColor?.startsWith("prop:")) {
                  const fillPropertyName =
                    mapSublayerControls[sublayer.uuid].style?.fillColor.slice(5);
                  fillColor = geoJsonFeature.properties[fillPropertyName];
                }
                return {
                  //manually add uuid and type fields for tracking later on
                  id: sublayer.name,
                  uuid: sublayer.uuid,
                  type: "vector",
                  //manually define defaults
                  color: mapSublayerControls[sublayer.uuid].style?.color,
                  opacity: mapSublayerControls[sublayer.uuid].style?.opacity,
                  weight: mapSublayerControls[sublayer.uuid].style?.weight,
                  fillColor: fillColor,
                  fillOpacity: mapSublayerControls[sublayer.uuid].style?.fillOpacity,
                };
              },
              onEachFeature: sublayer.name.includes("Grid") ? gridLayerOnEachFeature : null, //TODO: this is a hacky way to check if it's a grid layer
              interactive: false,
            });
            featureGroup.addLayer(vectorLayer);
            map.current.addLayer(featureGroup);
            if (sublayer.name.includes("Grid") && setGridLabels) {
              setGridLabels(newGridLabels);
            }
          };
          fetchGeojsonAsync();
        } else {
          // if layer is already on the map, bring it to the front. This has the effect of controlling zorder of layers
          const layer = getLayerByName(map, sublayer.name);
          layer.bringToFront();
        }
      } else if (sublayer.type === "vector-tile") {
        // if layer isn't already on the map, add it
        if (!isLayerOnMapByName(map, sublayer.name)) {
          const vectorTilePath = isExternal
            ? `${sublayer.path}/${sublayer.tilePattern}`
            : `${layerBaseURL}/${missionId}/Layers/${sublayer.path}/${sublayer.tilePattern}`;
          const vectorTileLayer = VectorTileLayer(vectorTilePath, {
            id: sublayer.name,
            uuid: sublayer.uuid,
            type: "vector-tile",
            style: {
              fill: false,
              stroke: true,
              //manually define defaults
              color: mapSublayerControls[sublayer.uuid].style?.color,
              opacity: mapSublayerControls[sublayer.uuid].style?.opacity,
              weight: mapSublayerControls[sublayer.uuid].style?.weight,
            },
            minDetailZoom: sublayer.minNativeZoom,
            maxDetailZoom: sublayer.maxNativeZoom,
            timeInfo: sublayerTimeInfo,
          });

          map.current.addLayer(vectorTileLayer);
          vectorTileLayer.bringToFront();
        } else {
          // if layer is already on the map, bring it to the front. This has the effect of controlling zorder of layers
          const layer = getLayerByName(map, sublayer.name);
          layer.bringToFront();
        }
      }
    });
};

/**
 * Draw grid labels based on the current map view and zoom level
 */
export const drawGridLabels = ({
  map,
  gridLabelFeatureGroup,
  gridLabels,
  planetRadius,
}: {
  map: MutableRefObject<L.Map>;
  gridLabelFeatureGroup: MutableRefObject<L.FeatureGroup>;
  gridLabels: GridLabelItem[];
  planetRadius: number;
}): void => {
  const mapZoom = map.current.getZoom();
  let modulo = 1;
  //zoom levels are different for earth and moon because you have to zoom in more to see the same amount of detail on the Earth
  if (planetRadius === EARTH_RADIUS) {
    //if earth (EARTH_RADIUS)
    if (mapZoom < 15) {
      modulo = 10;
    } else if (mapZoom < 16) {
      modulo = 5;
    } else if (mapZoom < 18) {
      modulo = 2;
    } else if (mapZoom >= 18) {
      modulo = 1;
    }
  } else {
    //if moon
    if (mapZoom < 13) {
      modulo = 10;
    } else if (mapZoom < 14) {
      modulo = 5;
    } else if (mapZoom < 15) {
      modulo = 2;
    } else if (mapZoom >= 15) {
      modulo = 1;
    }
  }

  // clear all grid labels
  gridLabelFeatureGroup.current.clearLayers();

  // bounds near the south pole becomes a skewed shape when pulled straight from Leaflet.
  // This process makes a square polygon using the map viewport as extents
  // Then turns that into a polygon and gets the bounds from that for checking if a grid label is in the map bounds
  const perimeter = getBoundsFromMapViewport(map);
  const polygon = L.polygon(perimeter);
  const bounds = polygon.getBounds();

  // loop through all grid labels and draw tooltips for the ones that match the modulo
  gridLabels.forEach((gridLabel) => {
    // ignore the label if it's not in the current map bounds

    if (!bounds.contains(gridLabel.latLng)) return;

    // get the label name and check the numbers to see if they match the modulo
    const labelNumberX = parseInt(gridLabel.id.split(" ")[0].slice(1));
    const labelNumberY = parseInt(gridLabel.id.split(" ")[1].slice(1));

    // the 1km grids do not have numbers on them, so just show them all the time
    if (isNaN(labelNumberX) || !(labelNumberX % modulo !== 0 || labelNumberY % modulo !== 0)) {
      // make a new tooltip for this grid label
      const tooltip = new L.Tooltip({
        sticky: false,
        direction: "right",
        offset: new L.Point(0, -8),
        permanent: true,
        className: "leaflet-tooltip-gridLabels",
        interactive: false,
        opacity: 0.8,
      });
      tooltip.setLatLng(gridLabel.latLng);
      tooltip.setContent(gridLabel.id);
      tooltip.addTo(gridLabelFeatureGroup.current);
    }
  });
};

/**
 * Gets the last (most recent) 2 pos entries for each pos type
 * Get the last 2 because we need at least 2 in order to draw the path
 * The last (most recent) entry is in index 0
 */
export const getLatestPosEntryByType = ({
  allPosEntries,
}: {
  allPosEntries: PosEntry[];
}): {
  [key: string]: PosEntry[];
} => {
  const posTypeLatestEntries: { [key: string]: PosEntry[] } = {};

  // gather the latest 2 pos entries  for each type. Most recent/latest entry is first in the array.
  const posEntriesToShowSortedByTime = orderBy(allPosEntries, ["createdAt"], ["desc"]);
  posEntriesToShowSortedByTime.forEach((posEntry) => {
    posEntry.posTypeUuids.forEach((posTypeUuid) => {
      // for each pos type in this pos entry, if we haven't seen 2 entries for it yet, add this entry to the list
      if (!posTypeLatestEntries[posTypeUuid] || posTypeLatestEntries[posTypeUuid].length < 2) {
        posTypeLatestEntries[posTypeUuid] = posTypeLatestEntries[posTypeUuid] || [];
        posTypeLatestEntries[posTypeUuid].push(posEntry);
      }
    });
  });

  return posTypeLatestEntries;
};

/**
 * Set the initial coords for where new measure tool lines will be initially drawn
 */
export const setMeasureStartingCoords = (
  map: MutableRefObject<L.Map>,
  dispatch: AppDispatch
): void => {
  // set measureInitialCoords to 1/3 of the way to the top left of the map and 1/3 of the way to the top right of the map
  const mapSize = map.current.getSize();
  const mapTopLeft = convertLeafletLatLngToAegisPoint(
    map.current.containerPointToLatLng([0 + mapSize.x / 3, 0 + mapSize.y / 3])
  );
  const mapTopRight = convertLeafletLatLngToAegisPoint(
    map.current.containerPointToLatLng([mapSize.x - mapSize.x / 3, 0 + mapSize.y / 3])
  );
  dispatch(setMeasureInitialCoords([mapTopLeft, mapTopRight]));
};

/**
 * Handle incoming map directives for stations, pois, actions, traverses, and measurements, and trigger map draw/edit modes appropriately
 */
export const handleMapDirective = ({
  map,
  mapDirective,
  originalPoints,
  draggableLines,
  dispatch,
}: {
  map: MutableRefObject<L.Map>;
  mapDirective: MapDirective;
  originalPoints: AEGISPoint[];
  draggableLines: MutableRefObject<DraggableLines>;
  dispatch: AppDispatch;
}): void => {
  switch (mapDirective.mapAction) {
    case "createMarker":
      // create events only come from Marker objects (pois and stations) since traverses are initially created by the app
      map.current.getContainer().style.cursor = "crosshair";
      break;

    case "cancelCreateMarker":
      clearAction();
      break;

    case "editMarker":
      map.current.getContainer().style.cursor = "crosshair";

      // find the marker on the map using uuid
      const markerToUpdate = getMapItemByUuid(
        map,
        mapDirective.uuid,
        mapDirective.mapItemType
      ) as AEGISMarker;

      if (markerToUpdate) {
        // make the marker draggable
        markerToUpdate.dragging.enable();
      }
      break;

    case "cancelEditMarker":
      clearAction();
      break;

    case "editPolyline":
      map.current.getContainer().style.cursor = "crosshair";
      // find this polyline layer on the map
      const polylineToUpdate = getMapItemByUuid(
        map,
        mapDirective.uuid,
        mapDirective.mapItemType
      ) as AEGISPolyline;

      if (polylineToUpdate) {
        draggableLines.current.enableForLayer(polylineToUpdate);

        // `snapEndpoints` controls whether to apply the server's snapped path
        // back to the visible layer. We only want to do this on dragend/remove
        // (when the user has stopped moving). Applying it mid-drag would
        // overwrite the user's in-progress mouse position with the path the
        // elevation API returned ~hundreds of ms ago — a visible flicker that
        // "snaps back" before the next mousemove pushes it forward again.
        const dispatchPath = async (e: L.LeafletEvent, snapEndpoints: boolean) => {
          //TODO: layer is deprecated but changing this to propagatedFrom throws a null when dragging?
          if (e.layer.uuid !== mapDirective.uuid) return;

          const path = convertLeafletLatLngsToAegisPoints(e.layer.getLatLngs());

          if (e.layer.mapItemType === "traverse") {
            //update path, elevation, and snap endpoints
            const response = await dispatch(
              thunkDocUpdateTraverse({
                traverseUuid: mapDirective.uuid,
                path,
              })
            );
            if (snapEndpoints) {
              //redraw the line in case we had to snap endpoints
              updatePolylineOnMap({
                map,
                uuid: mapDirective.uuid,
                path: response.payload as AEGISPoint[],
                mapItemType: "traverse",
              });
            }
          } else if (e.layer.mapItemType === "walkback") {
            //update path, elevation, and snap endpoints
            const response = await dispatch(
              thunkDocUpdateWalkback({
                path,
                stationUuid: mapDirective.uuid,
              })
            );
            if (snapEndpoints) {
              //redraw the line in case we had to snap endpoints
              updatePolylineOnMap({
                map,
                uuid: mapDirective.uuid,
                path: response.payload as AEGISPoint[],
                mapItemType: "walkback",
              });
            }
          } else if (e.layer.mapItemType === "measurement") {
            dispatch(thunkUpdateMeasurementPath({ path, measurementUuid: mapDirective.uuid }));
          }
        };

        draggableLines.current.on(
          "drag",
          throttle((e) => {
            dispatchPath(e, false);
          }, 100)
        );

        draggableLines.current.on("dragend", (e) => {
          dispatchPath(e, true);
        });

        draggableLines.current.on("remove", (e) => {
          dispatchPath(e, true);
        });
      }

      break;

    case "saveEditPolyline":
      // Save only for polyline edits. Markers save happen on click or drag end events
      // Only need to clear the map here, polyline is saved onchange.

      // Find this polyline layer on the map
      const mapItemByUuid = getMapItemByUuid(
        map,
        mapDirective.uuid,
        mapDirective.mapItemType
      ) as L.Polyline;
      if (mapItemByUuid) {
        draggableLines.current.disableForLayer(mapItemByUuid);
      }

      draggableLines.current.off("drag");
      draggableLines.current.off("dragend");
      draggableLines.current.off("remove");

      clearAction();
      break;

    case "cancelEditPolyline":
      const polylineToCancel = getMapItemByUuid(
        map,
        mapDirective.uuid,
        mapDirective.mapItemType
      ) as L.Polyline;
      if (polylineToCancel) draggableLines.current.disableForLayer(polylineToCancel);

      // Revert polyline path back to its original points
      // Measurements cannot be cancelled
      if (originalPoints?.length) {
        if (mapDirective.mapItemType === "traverse") {
          dispatch(
            thunkDocUpdateTraverse({
              traverseUuid: mapDirective.uuid,
              path: originalPoints,
            })
          );
        } else if (mapDirective.mapItemType === "walkback") {
          dispatch(
            thunkDocUpdateWalkback({ stationUuid: mapDirective.uuid, path: originalPoints })
          );
        }
      }

      draggableLines.current.off("drag");
      draggableLines.current.off("dragend");
      draggableLines.current.off("remove");

      clearAction();
      break;
    default:
  }

  function clearAction() {
    dispatch(updateMapDirective(null));
    map.current.getContainer().style.cursor = "grab";
  }
};

export const saveUpdatedItemPosition = async ({
  dispatch,
  uuid,
  mapItemType,
  location,
}: {
  dispatch: AppDispatch;
  uuid: string;
  mapItemType: MapItemType;
  location: AEGISPoint;
}): Promise<void> => {
  switch (mapItemType) {
    case "lander":
      await dispatch(thunkDocUpdateLanderLocation({ location }));
      break;
    case "poi":
      await dispatch(thunkDocUpdatePoiLocation({ location, poiUuid: uuid }));
      break;
    case "station":
      await dispatch(thunkDocUpdateStationLocation({ location, stationUuid: uuid }));
      break;
    case "action":
      await dispatch(thunkDocUpdateActionLocation({ location, actionUuid: uuid }));
      break;
    case "posEntry":
      await dispatch(thunkDocUpdatePosEntryWithLocation({ location, posEntryUuid: uuid }));
      break;
  }
};
