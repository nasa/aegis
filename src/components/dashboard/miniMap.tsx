import * as L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import "leaflet.tilelayer.colorfilter";
import "proj4leaflet";
import styles from "components/dashboard/miniMap.module.css";
import { useAppSelector, deepEqual } from "utils/useAppSelector";

import type { FunctionComponent } from "react";
import { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import orderBy from "lodash/orderBy";
import { isWindows10 } from "utils/browser";
import {
  scaleBarDiv,
  drawOrUpdateMarkerOnMap,
  drawLanderOnMap,
  drawPolylineOnMap,
  drawPosMarkerOnMap,
  getLayersToAddInOrder,
  drawLayersOnMap,
  getLatestPosEntryByType,
} from "components/page/leaflet-helper";
import "components/dashboard/map.module.css";
import { point } from "@turf/helpers";
import { circle, lineString } from "@turf/turf";
import { addTimeToDateTime } from "utils/mapping/timeLayers";
import PetInterval from "components/page/petInterval";
import { EARTH_RADIUS } from "utils/consts";
import isEqual from "lodash/isEqual";
import { selectEvaStations, selectEvaTraverses } from "store/selectors";
import { useMissionDocSelector } from "utils/useDocSelector";

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
  const stationCirclesFeatureGroup = useRef<L.FeatureGroup>(null);
  const gridLabelFeatureGroup = useRef<L.FeatureGroup>(null);
  const posEntryFeatureGroup = useRef<L.FeatureGroup>(null);
  const bigMapBoxFeatureGroup = useRef<L.FeatureGroup>(null);
  const partialMission = useMissionDocSelector(
    (doc) => ({
      id: doc.id,
      landerLocation: doc.landerLocation,
      projIsCustom: doc.projIsCustom,
      projResUnitsPerPixel: doc.projResUnitsPerPixel,
      projResZoomLevel: doc.projResZoomLevel,
      projEpsg: doc.projEpsg,
      projProj4String: doc.projProj4String,
      projOriginX: doc.projOriginX,
      projOriginY: doc.projOriginY,
      projBoundsMinX: doc.projBoundsMinX,
      projBoundsMinY: doc.projBoundsMinY,
      projBoundsMaxX: doc.projBoundsMaxX,
      projBoundsMaxY: doc.projBoundsMaxY,
      initialZoom: doc.initialZoom,
      planetRadius: doc.planetRadius,
      circleDefinitions: doc.circleDefinitions,
    }),
    deepEqual
  );

  const missionLayers = useAppSelector((state) => state.mission.layers, deepEqual);
  const missionSublayers = useAppSelector((state) => state.mission.sublayers, deepEqual);

  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );
  const runningEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === runningRexFromDb?.evaUuid),
    deepEqual
  );
  const stationsToShow = useAppSelector((state) => {
    if (!runningEvaFromDb) return [];
    return selectEvaStations(runningEvaFromDb.uuid)(state);
  }, deepEqual);
  const traversesToShow = useAppSelector((state) => {
    if (!runningEvaFromDb) return [];
    return selectEvaTraverses(runningEvaFromDb.uuid)(state);
  }, deepEqual);
  const egressLocation = useAppSelector((state) => {
    if (runningEvaFromDb?.egressLocationUuid === "lander") {
      return partialMission.landerLocation;
    } else {
      const foundStation = state.station.stations.find(
        (station) => station.uuid === runningEvaFromDb?.egressLocationUuid
      );
      return foundStation ? foundStation.location : null;
    }
  }, deepEqual);

  const [latestPosEntriesByType, setLatestPosEntriesByType] = useState<{
    [posTypeUuid: string]: PosEntry[];
  }>({});

  const [isWin10, setIsWin10] = useState<boolean>(false);
  const [mapZoom, setMapZoom] = useState<number>(0); // Used to trigger re-draw of scale. Value doens't matter
  const [mapDateTime, setMapDateTime] = useState<string>(undefined);
  const [rexPetTime, setRexPetTime] = useState<string>("");
  const [selectedRexDateTime, setSelectedRexDateTime] = useState<string>(null);

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
    return scaleBarDiv(map, partialMission.planetRadius, styles.scaleValue);

    // Include mapZoom but we arn't using it. Just need a way to re-trigger this effect when mapZoom changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, partialMission.planetRadius, mapZoom]);

  /**
   * Map instantiation
   */
  useLayoutEffect(() => {
    if (!mapRef.current || !map || !partialMission) return;

    // instantiate the prog4leaflet crs using the values in the mission config
    if (partialMission.projIsCustom === true) {
      const baseRes =
        partialMission.projResUnitsPerPixel * Math.pow(2, partialMission.projResZoomLevel);

      const resolutions = [];
      for (let i = 0; i < 32; i++) {
        resolutions.push(baseRes / Math.pow(2, i));
      }

      crs.current = new L.Proj.CRS(partialMission.projEpsg, partialMission.projProj4String, {
        origin: [partialMission.projOriginX, partialMission.projOriginY],
        resolutions,
        bounds: L.bounds(
          [partialMission.projBoundsMinX, partialMission.projBoundsMinY],
          [partialMission.projBoundsMaxX, partialMission.projBoundsMaxY]
        ),
      });
    }

    // Instantiate the map
    if (!map.current) {
      const center = [
        partialMission.landerLocation.lat,
        partialMission.landerLocation.lng,
      ] as L.LatLngExpression;
      const zoom = partialMission.initialZoom || 13;

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
    if (!stationCirclesFeatureGroup.current) {
      stationCirclesFeatureGroup.current = L.featureGroup().addTo(map.current);
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
    if (bigMapBounds) {
      bigMapBoxFeatureGroup.current.clearLayers();
      bigMapBoxFeatureGroup.current.addLayer(
        L.geoJSON(
          lineString([
            [bigMapBounds[0][1], bigMapBounds[0][0]],
            [bigMapBounds[2][1], bigMapBounds[2][0]],
            [bigMapBounds[1][1], bigMapBounds[1][0]],
            [bigMapBounds[3][1], bigMapBounds[3][0]],
            [bigMapBounds[0][1], bigMapBounds[0][0]],
          ]),
          {
            style: {
              color: "#ffffff",
              weight: 2,
              fillOpacity: 0,
              interactive: false,
            },
          }
        )
      );
    }
  }, [mapRef, map, partialMission, bigMapBounds]);

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
    if (!partialMission.id || !map.current || !selectedPreset || !missionLayers) return;

    const layersToAddInOrder = getLayersToAddInOrder({
      selectedPreset,
      missionSublayers,
      missionLayers,
      mapDateTime,
      setTimeLayerInfo: null,
    });

    drawLayersOnMap({
      map,
      mapSublayerControls: selectedPreset.mapSublayerControls,
      layersToAddInOrder,
      missionId: partialMission.id,
      mapTime: null,
      setGridLabels: null,
    });
  }, [partialMission, map, missionLayers, missionSublayers, selectedPreset, mapDateTime]);

  /**
   * Pan/zoom map view to fit all objects in view when objects or positions change
   */
  useEffect(() => {
    let objectCoordinates: AEGISPoint[] = [];

    // get the coordinates of all objects that are in progress
    for (const station of stationsToShow) {
      if (station?.location) {
        objectCoordinates.push(station.location);
      }
    }
    for (const traverse of traversesToShow) {
      if (traverse?.path) {
        objectCoordinates = objectCoordinates.concat(traverse.path);
      }
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
      const maxZoom = partialMission.planetRadius === EARTH_RADIUS ? 19 : 17; // if on earth, 19 is max zoom, otherwise 18 (moon)
      map.current.fitBounds(bounds, { maxZoom });
    }
  }, [map, partialMission, latestPosEntriesByType, stationsToShow, traversesToShow, bigMapBounds]);

  /**
   * Determine stations to show and draw them on map when stations or selections change
   */
  useEffect(() => {
    if (!stationsToShow || !map.current) return;

    // remove all stations from the map
    stationFeatureGroup.current.clearLayers();

    // Remove each circle layer individually because leaflet doesn't clear these geojson layers with .clearLayers()
    stationCirclesFeatureGroup.current.eachLayer((layer) => {
      layer.remove();
    });

    // draw all stations
    stationsToShow.forEach((station) => {
      if (station?.location) {
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

        const circleDefinitions = partialMission.circleDefinitions;

        // draw circle around station for each mapCircleControl.
        Object.entries(circleDefinitions || {}).forEach(([uuid, circleDefinition]) => {
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
          const radiusAdjustment = earthRadiusInMeters / partialMission.planetRadius;

          const drawDistance = (circleDefinition.radius * radiusAdjustment) / 1000;

          if (station.mapCircleControls[uuid]?.visible) {
            // Turf Coords are in (lng, lat) format

            const circleStyle = station.mapCircleControls[uuid]?.style;

            const dashLen = circleStyle?.dashLen || 10;

            const stationCircles: AEGISGeoJSONCircle[] = [];

            stationCircles.push(
              L.geoJSON(
                circle(point([station.location.lng, station.location.lat]), drawDistance, {
                  steps: 256,
                }),
                {
                  style: {
                    ...circleStyle,
                    interactive: false,
                    dashArray: circleStyle.isDashed ? `${dashLen}, ${dashLen}` : undefined,
                  },
                }
              ) as AEGISGeoJSONCircle
            );

            if (circleStyle?.isDashed) {
              stationCircles.push(
                L.geoJSON(
                  circle(point([station.location.lng, station.location.lat]), drawDistance, {
                    steps: 256,
                  }),
                  {
                    style: {
                      ...circleStyle,
                      color: circleStyle?.altColor,
                      opacity: circleStyle?.altOpacity,
                      interactive: false,
                      dashArray: `${dashLen}, ${dashLen}`,
                      dashOffset: `${dashLen}`,
                    },
                  }
                ) as AEGISGeoJSONCircle
              );
            }

            stationCircles.forEach((circleLayer) => {
              circleLayer.mapItemType = "stationCircle";
              circleLayer.uuid = `${station.uuid}-${uuid}`; // Add unique identifier
              stationCirclesFeatureGroup.current.addLayer(circleLayer);
            });
          }
        });
      }
    });

    stationFeatureGroup.current.setZIndex(999);
    stationCirclesFeatureGroup.current.setZIndex(998);
  }, [stationsToShow, isWin10, partialMission.circleDefinitions, partialMission.planetRadius]);

  /**
   * Determine current map time and update the map time state
   */
  useEffect(() => {
    if (selectedRexDateTime) {
      setMapDateTime(selectedRexDateTime);
    } else {
      setMapDateTime(null);
    }
  }, [selectedRexDateTime]);

  /** Determine time assosiated with currently running rex time */
  useEffect(() => {
    if (runningEvaFromDb?.datetime) {
      if (runningRexFromDb.petRunning && rexPetTime.endsWith("0")) {
        setSelectedRexDateTime(addTimeToDateTime(runningEvaFromDb.datetime, rexPetTime));
      } else if (runningRexFromDb) {
        setSelectedRexDateTime(runningEvaFromDb.datetime);
      } else {
        setSelectedRexDateTime(null);
      }
    } else {
      setSelectedRexDateTime(null);
    }
  }, [rexPetTime, runningEvaFromDb?.datetime, runningRexFromDb]);

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
      if (!traverse) return;

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
      !partialMission?.landerLocation ||
      !partialMission?.circleDefinitions ||
      !selectedPreset?.mapCircleControls ||
      !partialMission?.planetRadius
    )
      return;

    const circleDefinitions = partialMission.circleDefinitions;
    const landerLocation = partialMission.landerLocation;

    map.current.eachLayer((layer: AEGISGeoJSONCircle) => {
      if (layer.mapItemType === "landerCircle") {
        layer.remove();
      }
    });

    Object.entries(circleDefinitions || {}).forEach(([uuid, circleDefinition]) => {
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
      const radiusAdjustment = earthRadiusInMeters / partialMission.planetRadius;

      const drawDistance = (circleDefinition.radius * radiusAdjustment) / 1000;

      if (selectedPreset.mapCircleControls[uuid]?.visible) {
        const circleStyle = selectedPreset.mapCircleControls[uuid]?.style;

        const landerCircle: AEGISGeoJSONCircle[] = [];

        const dashLen = circleStyle?.dashLen || 10;

        landerCircle.push(
          L.geoJSON(
            circle(point([landerLocation.lng, landerLocation.lat]), drawDistance, {
              steps: 256,
            }),
            {
              style: {
                ...circleStyle,
                interactive: false,
                dashArray: circleStyle.isDashed ? `${dashLen}, ${dashLen}` : undefined,
              },
            }
          ) as AEGISGeoJSONCircle
        );

        if (circleStyle?.isDashed) {
          landerCircle.push(
            L.geoJSON(
              circle(point([landerLocation.lng, landerLocation.lat]), drawDistance, {
                steps: 256,
              }),
              {
                style: {
                  ...circleStyle,
                  color: circleStyle?.altColor,
                  opacity: circleStyle?.altOpacity,
                  interactive: false,
                  dashArray: `${dashLen}, ${dashLen}`,
                  dashOffset: `${dashLen}`,
                },
              }
            ) as AEGISGeoJSONCircle
          );
        }

        landerCircle.forEach((circleLayer) => {
          circleLayer.mapItemType = "landerCircle";
          circleLayer.uuid = `lander-${uuid}`; // Add unique identifier
          map.current.addLayer(circleLayer);
        });
      }
    });
  }, [
    partialMission?.landerLocation,
    partialMission?.circleDefinitions,
    partialMission?.planetRadius,
    map,
    selectedPreset?.mapCircleControls,
  ]);

  /**
   * Draw lander
   */
  useEffect(() => {
    if (!map.current || !partialMission.landerLocation) return;

    drawLanderOnMap({
      map,
      location: partialMission.landerLocation,
      sizePx: 25,
      tooltipOptions: {
        interactive: false,
      },
    });
  }, [map, partialMission?.landerLocation, isWin10]);

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
      // Filter out any undefined values from sourceUuids before checking length
      const validSourceUuids = mapDisplayPos.sourceUuids.filter((uuid) => uuid != null);
      if (validSourceUuids.length > 0) {
        filteredPosEntries = runningRexFromDb?.posEntries?.filter((posEntry) =>
          validSourceUuids.includes(posEntry.posSourceUuid)
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
      if (isEqual(posEntry.location, egressLocation)) continue; // don't draw pos entries on top of lander

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
  }, [map, runningRexFromDb, isWin10, mapDisplayPos, egressLocation]);

  return (
    <div className={styles.mapContainer} ref={mapContainerRef}>
      <PetInterval
        runningRex={runningRexFromDb}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <div className={styles.map} ref={mapRef} />
      <div className={styles.mapScaleDisplay}>{showScaleBar && drawScaleBar()}</div>
    </div>
  );
};

export default MiniMap;
