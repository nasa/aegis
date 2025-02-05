import * as L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import "leaflet.tilelayer.colorfilter";
import "proj4leaflet";
import styles from "components/dashboard/miniMap.module.css";
import { useAppSelector, deepEqual } from "utils/useAppSelector";

import {
  useEffect,
  useRef,
  useState,
  FunctionComponent,
  useLayoutEffect,
  useCallback,
} from "react";
import orderBy from "lodash/orderBy";
import pick from "lodash/pick";
import { isWindows10 } from "utils/browser";
import {
  scaleBarDiv,
  drawOrUpdateMarkerOnMap,
  drawPolylineOnMap,
  drawPosMarkerOnMap,
  getLayersToAddInOrder,
  drawLayersOnMap,
  getLatestPosEntryByType,
} from "components/page/leaflet-helper";
import "components/dashboard/map.module.css";
import { point } from "@turf/helpers";
import { circle } from "@turf/turf";
import { EARTH_RADIUS } from "utils/consts";

const MiniMap: FunctionComponent<{
  bigMapBounds: L.LatLngBoundsLiteral;
  mapDisplayPos: MapDisplayPos;
  showScaleBar: boolean;
  selectedPreset: Preset;
  showArrows: boolean;
}> = ({ bigMapBounds, mapDisplayPos, showScaleBar, selectedPreset, showArrows }) => {
  const mapRef = useRef(null);
  const map = useRef<L.Map>(null);
  const crs = useRef<L.Proj.CRS>(null);
  const stationFeatureGroup = useRef<L.FeatureGroup>(null);
  const gridLabelFeatureGroup = useRef<L.FeatureGroup>(null);
  const posEntryFeatureGroup = useRef<L.FeatureGroup>(null);
  const bigMapBoxFeatureGroup = useRef<L.FeatureGroup>(null);

  const mission: MissionSelectProperties = useAppSelector(
    (state) =>
      pick(state.mission.missionFromDb, [
        "id",
        "landerLocation",
        "initialZoom",
        "planetRadius",
        "activeGridUuid",
        "projBoundsMaxX",
        "projBoundsMaxY",
        "projBoundsMinX",
        "projBoundsMinY",
        "projEpsg",
        "projProj4String",
        "projResZoomLevel",
        "projResUnitsPerPixel",
        "projIsCustom",
        "projOriginX",
        "projOriginY",
        "circleDefinitions",
      ]),
    deepEqual
  );
  const missionLayers = useAppSelector((state) => state.mission.layers, deepEqual);
  const missionSublayers = useAppSelector((state) => state.mission.sublayers, deepEqual);

  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );
  const runningEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === runningRexFromDb.evaUuid),
    deepEqual
  );
  const stationsToShow = useAppSelector((state) => {
    if (!runningEvaFromDb) return [];
    const stationSequenceItems = runningEvaFromDb.sequence.filter(
      (item) => item.type === "station"
    );
    const stationsInEva = state.station.stationsFromDb.filter((station) =>
      stationSequenceItems.find((item) => item.uuid === station.uuid)
    );
    return stationsInEva;
  }, deepEqual);
  const traversesToShow = useAppSelector((state) => {
    if (!runningEvaFromDb) return [];
    const traverseSequenceItems = runningEvaFromDb.sequence.filter(
      (item) => item.type === "traverse"
    );
    const traversesInEva = state.traverse.traversesFromDb.filter((traverse) =>
      traverseSequenceItems.find((item) => item.uuid === traverse.uuid)
    );
    return traversesInEva;
  }, deepEqual);

  const [latestPosEntriesByType, setLatestPosEntriesByType] = useState<{
    [posTypeUuid: string]: PosEntry[];
  }>({});

  const [isWin10, setIsWin10] = useState<boolean>(false);
  const [mapZoom, setMapZoom] = useState<number>(0); // Used to trigger re-draw of scale. Value doens't matter

  useEffect(() => {
    const checkWindowsVersion = async () => {
      const result = await isWindows10();
      setIsWin10(result);
    };

    checkWindowsVersion();
  }, []);

  /**
   * Draw the scale bar on the map
   */
  const drawScaleBar = useCallback(() => {
    return scaleBarDiv(map, mission.planetRadius, styles.scaleValue);

    // Include mapZoom but we arn't using it. Just need a way to re-trigger this effect when mapZoom changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mission.planetRadius, mapZoom]);

  /**
   * Map instantiation
   */
  useLayoutEffect(() => {
    if (!mapRef.current || !map || !mission) return;

    // instantiate the prog4leaflet crs using the values in the mission config
    if (mission.projIsCustom === true) {
      const baseRes = mission.projResUnitsPerPixel * Math.pow(2, mission.projResZoomLevel);

      const resolutions = [];
      for (let i = 0; i < 32; i++) {
        resolutions.push(baseRes / Math.pow(2, i));
      }

      crs.current = new L.Proj.CRS(mission.projEpsg, mission.projProj4String, {
        origin: [mission.projOriginX, mission.projOriginY],
        resolutions,
        bounds: L.bounds(
          [mission.projBoundsMinX, mission.projBoundsMinY],
          [mission.projBoundsMaxX, mission.projBoundsMaxY]
        ),
      });
    }

    // Instantiate the map
    if (!map.current) {
      const center = [mission.landerLocation.lat, mission.landerLocation.lng] as L.LatLngExpression;
      const zoom = mission.initialZoom || 13;

      map.current = L.map(mapRef.current, {
        center: center,
        zoom: zoom,
        zoomControl: false,
        fadeAnimation: true,
        dragging: false,
      });
      map.current.on("zoomend", () => {
        setMapZoom(map.current.getZoom());
      });
    }

    if (crs.current) {
      map.current.options.crs = crs.current;
    }
    if (!stationFeatureGroup.current) {
      stationFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!gridLabelFeatureGroup.current) {
      gridLabelFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!posEntryFeatureGroup.current) {
      posEntryFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!bigMapBoxFeatureGroup.current) {
      bigMapBoxFeatureGroup.current = L.featureGroup().addTo(map.current);
    }

    // draw the box for the big map bounds
    if (bigMapBounds && !mission.projIsCustom) {
      bigMapBoxFeatureGroup.current.clearLayers();
      bigMapBoxFeatureGroup.current.addLayer(
        L.rectangle(bigMapBounds, {
          color: "#ffffff",
          weight: 2,
          fillOpacity: 0,
          interactive: false,
        })
      );
    }
  }, [mapRef, map, mission, bigMapBounds]);

  /**
   * Resize the map when the container dimensions change (via flexbox or window resize)
   * https://legacy.reactjs.org/docs/hooks-faq.html#how-can-i-measure-a-dom-node
   */
  const mapContainerRef = useCallback(
    (node: Element) => {
      if (!node) return;
      const resizeObserver = new ResizeObserver(() => {
        // all this to keep the map in the same position when the right window closes or opens
        const prevCenterPixels = map.current.project(
          map.current.getCenter(),
          map.current.getZoom()
        );
        const currentWidth = map.current.getSize().x;

        map.current.invalidateSize();

        const newWidth = map.current.getSize().x;
        const newCenterPixels = prevCenterPixels.add([(newWidth - currentWidth) / 2, 0]);
        const newCenter = map.current.unproject(newCenterPixels, map.current.getZoom());
        map.current.setView(newCenter, map.current.getZoom(), { animate: true });
      });
      resizeObserver.observe(node);
    },
    [map]
  );

  /**
   * Map layers display management
   */
  useEffect(() => {
    if (!mission.id || !map.current || !selectedPreset || !missionLayers) return;

    const layersToAddInOrder = getLayersToAddInOrder({
      selectedPreset,
      missionSublayers,
      missionLayers,
    });

    drawLayersOnMap({
      map,
      mapSublayerControls: selectedPreset.mapSublayerControls,
      layersToAddInOrder,
      missionId: mission.id,
      setGridLabels: null,
    });
  }, [mission, map, missionLayers, missionSublayers, selectedPreset]);

  /**
   * Pan/zoom map view to fit all objects in view when objects or positions change
   */
  useEffect(() => {
    let objectCoordinates: AEGISPoint[] = [];

    // get the coordinates of all objects that are in progress
    for (const station of stationsToShow) {
      objectCoordinates.push(station.location);
    }
    for (const traverse of traversesToShow) {
      objectCoordinates = objectCoordinates.concat(traverse.path);
    }
    for (const posTypeUuid in latestPosEntriesByType) {
      const lastPosEntry = latestPosEntriesByType[posTypeUuid][0];
      objectCoordinates.push(lastPosEntry.location);
    }
    if (bigMapBounds) {
      objectCoordinates.push({ lat: bigMapBounds[0][0], lng: bigMapBounds[0][1] });
      objectCoordinates.push({ lat: bigMapBounds[1][0], lng: bigMapBounds[1][1] });
    }

    // get max and min coordinate bounds of all objects
    let maxLat: number = null;
    let minLat: number = null;
    let maxLng: number = null;
    let minLng: number = null;
    objectCoordinates.forEach((coord) => {
      if (!coord) return;
      if (!maxLat || coord.lat > maxLat) {
        maxLat = coord.lat;
      }
      if (!minLat || coord.lat < minLat) {
        minLat = coord.lat;
      }
      if (!maxLng || coord.lng > maxLng) {
        maxLng = coord.lng;
      }
      if (!minLng || coord.lng < minLng) {
        minLng = coord.lng;
      }
    });

    // set the map view to the bounds of all objects
    if (maxLat && minLat && maxLng && minLng) {
      const bounds = L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
      const maxZoom = mission.planetRadius === EARTH_RADIUS ? 19 : 17; // if on earth, 19 is max zoom, otherwise 18 (moon)
      map.current.fitBounds(bounds, { maxZoom });
    }
  }, [map, mission, latestPosEntriesByType, stationsToShow, traversesToShow, bigMapBounds]);

  /**
   * Determine stations to show and draw them on map when stations or selections change
   */
  useEffect(() => {
    if (!stationsToShow || !map.current) return;

    // remove all stations from the map
    stationFeatureGroup.current.clearLayers();

    // draw all stations
    stationsToShow.forEach((station) => {
      if (station.location) {
        drawOrUpdateMarkerOnMap({
          map,
          featureGroup: stationFeatureGroup,
          name: station.name,
          uuid: station.uuid,
          iconEmoji: station.icon ? station.icon : "2754", //default to question mark
          mapItemType: "station",
          location: station.location,
          isWin10,
          iconClassName: styles.mapIcon,
          iconWin10ClassName: styles.mapIconWin10,
          iconWrapperClassName: styles.iconWrapper,
          markerOptions: {
            interactive: false,
          },
        });
      }
    });

    stationFeatureGroup.current.setZIndex(999);
  }, [stationsToShow, isWin10]);

  /**
   * Determine traverses to show and draw them on map when traverses or selections change
   */
  useEffect(() => {
    if (!traversesToShow || !map.current) return;

    // delete all traverses from the map
    map.current.eachLayer((layer: AEGISMapDrawingLayer) => {
      if (layer.mapItemType === "traverse") {
        map.current.removeLayer(layer);
      }
    });
    // draw all traverses in the selectedEva sequence
    traversesToShow.forEach((traverse) => {
      const baseColor = traverse.color || runningEvaFromDb?.traverseColor || "#03adfc";

      drawPolylineOnMap({
        map,
        name: traverse.name,
        uuid: traverse.uuid,
        path: traverse.path,
        color: baseColor,
        mapItemType: "traverse",
        showArrows,
        polylineOptions: {
          weight: 5,
          interactive: false,
          outlineWeight: 0,
        },
        arrowHeadOptions: {
          pixelSize: 15,
        },
      });
    });
  }, [runningEvaFromDb, traversesToShow, showArrows]);

  /**
   * Draw lander circles
   */
  useEffect(() => {
    if (
      !map ||
      !mission?.landerLocation ||
      !mission?.circleDefinitions ||
      !selectedPreset?.mapCircleControls ||
      !mission?.planetRadius
    )
      return;

    const circleDefinitions = mission.circleDefinitions;
    const landerLocation = mission.landerLocation;

    map.current.eachLayer((layer: AEGISGeoJSONCircle) => {
      if (layer.mapItemType === "landerCircle") {
        layer.remove();
      }
    });

    circleDefinitions.forEach((circleDefinition) => {
      /*
       * Map does NOT think in terms of planets for coordinates,
       * and currently acts as if coordinates correspond to earth.
       * Therefore, it is necessary to calculate distance in relation
       * to the radius of the earth, and not in relation to the planet
       * the mission is on for the projection.
       *
       * Previously, non-equatorial map projections required an additional
       * adjustment of Initial Radius Adjust * Earth Radius / (2 * Planet Radius).
       * This is seemingly no longer needed, but keep this in mind in case.
       */
      const earthRadiusInMeters = EARTH_RADIUS;
      const radiusAdjustment = earthRadiusInMeters / mission.planetRadius;

      const drawDistance = (circleDefinition.radius * radiusAdjustment) / 1000;

      if (selectedPreset.mapCircleControls[circleDefinition.uuid]?.visible) {
        if (selectedPreset.mapCircleControls[circleDefinition.uuid]?.visible) {
          // Turf Coords are in (lng, lat) format
          const geoJSONCircle: AEGISGeoJSONCircle = L.geoJSON(
            circle(point([landerLocation.lng, landerLocation.lat]), drawDistance, {
              steps: 256,
            }),
            {
              style: {
                ...selectedPreset.mapCircleControls[circleDefinition.uuid]?.style,
                interactive: false,
              },
            }
          ) as AEGISGeoJSONCircle;

          geoJSONCircle.mapItemType = "landerCircle";

          map.current.addLayer(geoJSONCircle);
        }
      }
    });
  }, [
    mission?.landerLocation,
    mission?.circleDefinitions,
    mission?.planetRadius,
    map,
    selectedPreset?.mapCircleControls,
  ]);

  /**
   * Draw lander
   */
  useEffect(() => {
    if (!map.current || !mission.landerLocation) return;

    drawOrUpdateMarkerOnMap({
      map,
      featureGroup: null,
      name: "Lander",
      uuid: "lander",
      iconEmoji: "1f680", //rocket
      mapItemType: "lander",
      location: mission.landerLocation,
      isWin10,
      iconClassName: styles.mapIcon,
      iconWin10ClassName: styles.mapIconWin10,
      iconWrapperClassName: styles.iconWrapper,
      markerOptions: {
        interactive: false,
      },
    });
  }, [map, mission?.landerLocation, isWin10]);

  /**
   * General Pos Entry drawing function. Determines which pos entries to show and draws them on the map. Also determines latest pos entries for each pos type.
   */
  useEffect(() => {
    if (!map.current) return;

    let posEntriesToShow: PosEntry[] = [];
    let posTypeLatestEntries: { [key: string]: PosEntry[] } = {};

    // determine which pos entries to show
    if (mapDisplayPos.show) {
      let filteredPosEntries: PosEntry[] = [];
      if (mapDisplayPos.sourceUuids.length > 0) {
        filteredPosEntries = runningRexFromDb?.posEntries?.filter((posEntry) =>
          mapDisplayPos.sourceUuids.includes(posEntry.posSourceUuid)
        );
      } else {
        filteredPosEntries = runningRexFromDb?.posEntries;
      }
      posEntriesToShow = orderBy(filteredPosEntries, ["createdAt"], "desc");
      // gather the latest 2 pos entries (need 2 in order to draw a polyline) for each type.
      // Most recent/latest entry is first in the array.
      posTypeLatestEntries = getLatestPosEntryByType({
        allPosEntries: filteredPosEntries,
      });
    }

    // delete all pos entries in leaflet
    posEntryFeatureGroup.current.clearLayers();

    // draw or update all pos markers
    for (const posEntry of posEntriesToShow) {
      if (!mapDisplayPos.show) break; //exit for, no markers need to be drawn
      if (!posEntry.location) continue; // go to next pos entry

      // determine if this is one of the latest entries.
      const overridePosTypesUuidsToDraw: string[] = [];
      let drawThisEntry = false;
      posEntry.posTypeUuids.forEach((posTypeUuid) => {
        // check if this pos type is one of the latest entries
        if (posTypeLatestEntries[posTypeUuid][0]?.uuid === posEntry.uuid) {
          drawThisEntry = true;
          overridePosTypesUuidsToDraw.push(posTypeUuid);
        }
      });

      if (drawThisEntry) {
        drawPosMarkerOnMap({
          map,
          posEntry: posEntry,
          posEntryFeatureGroup,
          selectedOrRunningRex: runningRexFromDb,
          overridePosTypesUuidsToDraw:
            overridePosTypesUuidsToDraw.length > 0 ? overridePosTypesUuidsToDraw : null,
          isWin10,
          showOldMarkers: false,
          showLatestLabels: false,
          rexPetTime: "",
          markerOptions: {
            opacity: 1,
            interactive: false,
          },
          iconClassName: styles.posIcon,
          iconWin10ClassName: styles.posIconWin10,
          iconWrapperClassName: styles.iconWrapper,
          barClassName: styles.posBar,
          overrideEVIcon: true,
          miniMap: true,
          barOffset: 6,
        });
      }
    }
    //set in local state to be used in other use effects. Do this last so markers exist
    setLatestPosEntriesByType(posTypeLatestEntries);
  }, [map, runningRexFromDb, isWin10, mapDisplayPos]);

  return (
    <div className={styles.mapContainer} ref={mapContainerRef}>
      <div className={styles.map} ref={mapRef} />
      <div className={styles.mapScaleDisplay}>{showScaleBar && drawScaleBar()}</div>
    </div>
  );
};

export default MiniMap;
