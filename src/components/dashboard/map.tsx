import * as L from "leaflet";
L.Icon.Default.imagePath = "/leaflet/images/";
// Import the plugin libraries so they will modify L
import "leaflet.tilelayer.colorfilter";
import "proj4leaflet";
import styles from "components/dashboard/map.module.css";
import { useAppSelector, deepEqual } from "utils/useAppSelector";

import {
  useEffect,
  useRef,
  useState,
  FunctionComponent,
  useLayoutEffect,
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
} from "react";
import pick from "lodash/pick";
import reverse from "lodash/reverse";
import uniqBy from "lodash/uniqBy";
import orderBy from "lodash/orderBy";
import { secondsFromhhmmss, hhmmssFromSeconds, titleCase } from "utils/formatting";
import PetInterval from "../page/petInterval";
import { isWindows10 } from "utils/browser";
import {
  getMapItemByUuid,
  scaleBarDiv,
  drawOrUpdateMarkerOnMap,
  drawLanderOnMap,
  drawPolylineOnMap,
  drawPosPathOnMap,
  drawPosMarkerOnMap,
  getLayersToAddInOrder,
  drawGridLabels,
  drawLayersOnMap,
  getLatestPosEntryByType,
} from "components/page/leaflet-helper";
import { MapViewMenu } from "components/interface/map/map-menu-view";
import "components/dashboard/map.module.css";
import { SunEarth } from "components/interface/map/map-sunearth";
import { MultiSelectDropdown } from "components/interface/form/globalFields";
import { featureCollection, lineString, point } from "@turf/helpers";
import { circle } from "@turf/turf";
import {
  adjustGridIndex,
  convertLeafletLatLngToAegisPoint,
  findClosestPointInGlobalGrid,
} from "utils/mapping/geoMath";
import { Feature } from "geojson";
import PresetMenu from "../interface/map/map-menu-preset";
import { addTimeToDateTime } from "utils/mapping/timeLayers";
import { EARTH_RADIUS } from "utils/consts";
import { globalGrid } from "utils/mapping/grid";
import { selectAsPlannedStations } from "store/selectors";
import isEqual from "lodash/isEqual";

const MapBody: FunctionComponent<{
  setShowScaleBar: Dispatch<SetStateAction<boolean>>;
  setBigMapBounds: Dispatch<SetStateAction<L.LatLngBoundsLiteral>>;
  mapDisplayPos: MapDisplayPos;
  setMapDisplayPos: Dispatch<SetStateAction<MapDisplayPos>>;
  showScaleBar: boolean;
  selectedPreset: Preset;
  setSelectedPreset: Dispatch<SetStateAction<Preset>>;
  showArrows: boolean;
  setShowArrows: Dispatch<SetStateAction<boolean>>;
}> = ({
  setShowScaleBar,
  setBigMapBounds,
  mapDisplayPos,
  setMapDisplayPos,
  showScaleBar,
  selectedPreset,
  setSelectedPreset,
  showArrows,
  setShowArrows,
}) => {
  const mapRef = useRef(null);
  const map = useRef<L.Map>(null);
  const crs = useRef<L.Proj.CRS>(null);
  const stationFeatureGroup = useRef<L.FeatureGroup>(null);
  const actionFeatureGroup = useRef<L.FeatureGroup>(null);
  const gridLabelFeatureGroup = useRef<L.FeatureGroup>(null);
  const posEntryFeatureGroup = useRef<L.FeatureGroup>(null);
  const highlightFeatureGroup = useRef<L.FeatureGroup>(null);

  /**
   * All states are FromDb thereby requring all changes to be saved before they
   *   show up on the dashboard
   */
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
        "usingLGRSCoordinates",
      ]),
    deepEqual
  );
  const missionLayers = useAppSelector((state) => state.mission.layers, deepEqual);
  const missionSublayers = useAppSelector((state) => state.mission.sublayers, deepEqual);

  const presetsFromDb = useAppSelector((state) => state.preset.presetsFromDb, deepEqual);

  const stationsFromDb = useAppSelector((state) => state.station.stationsFromDb, deepEqual);
  const traversesFromDb = useAppSelector((state) => state.traverse.traversesFromDb, deepEqual);
  const actionsFromDb = useAppSelector((state) => state.action.actionsFromDb, deepEqual);
  const runningRexFromDb = useAppSelector(
    (state) => state.rex.rexesFromDb.find((r) => r.isRunning),
    deepEqual
  );
  const stationsInProgress: Station[] = useAppSelector((state) => {
    const stationsInProgress: Station[] = [];
    for (const stationUuid in runningRexFromDb.stationEntries) {
      const stationEntry: ActivityEntry = runningRexFromDb.stationEntries[stationUuid];
      if (stationEntry.rexStatus === "in-progress") {
        stationsInProgress.push(
          state.station.stationsFromDb.find((station) => station.uuid === stationUuid)
        );
      }
    }
    return stationsInProgress;
  }, deepEqual);
  const traversesInProgress: Traverse[] = useAppSelector((state) => {
    const traversesInProgress: Traverse[] = [];
    for (const traverseUuid in runningRexFromDb.traverseEntries) {
      const traverseEntry: ActivityEntry = runningRexFromDb.traverseEntries[traverseUuid];
      if (traverseEntry.rexStatus === "in-progress") {
        traversesInProgress.push(
          state.traverse.traversesFromDb.find((traverse) => traverse.uuid === traverseUuid)
        );
      }
    }
    return traversesInProgress;
  }, deepEqual);

  const runningEvaFromDb = useAppSelector(
    (state) => state.eva.evasFromDb.find((eva) => eva.uuid === runningRexFromDb?.evaUuid),
    deepEqual
  );
  const selectedEva = useAppSelector(
    (state) => state.eva.evas.find((eva) => eva.uuid === state.eva.selectedEvaUuid),
    deepEqual
  );
  const asPlannedStationUuids = useAppSelector(
    (state) => selectAsPlannedStations(state).map((s) => s.uuid),
    deepEqual
  );

  const gridCorner = useAppSelector((state) => state.map.gridCornerPoint, deepEqual);

  const egressLocation = useAppSelector(
    (state) => {
      if (isEqual(runningEvaFromDb?.egressLocationUuid, "lander")) {
        return state.mission.mission.landerLocation;
      } else {
        const foundStation = state.station.stations.find(
          (station) => station.uuid === runningEvaFromDb?.egressLocationUuid
        );
        return foundStation ? foundStation.location : null;
      }
    },

    deepEqual
  );

  const [posEntriesShowing, setPosEntriesShowing] = useState<PosEntry[]>([]);
  const [latestPosEntriesByType, setLatestPosEntriesByType] = useState<{
    [posTypeUuid: string]: PosEntry[];
  }>({});

  /*** Eyeball menu toggles */
  const [mapDisplayPois, setMapDisplayPois] = useState<MapDisplayMarkers>({
    show: false,
    showLabels: false,
  });
  const [mapDisplayStations, setMapDisplayStations] = useState<MapDisplayStations>({
    show: false,
    showLabels: false,
    showWalkbacks: true,
    showCircles: false,
  });
  const [mapDisplayActions, setMapDisplayActions] = useState<MapDisplayMarkers>({
    show: true,
    showLabels: false,
  });
  const [showSunEarth, setShowSunEarth] = useState<boolean>(true);
  const [gridBounds, setGridBounds] = useState<GridIndex[]>(undefined);
  const [mapGridControls, setMapGridControls] = useState<MapGridControl>(undefined);
  const [mapDateTime, setMapDateTime] = useState<string>(undefined);
  const [selectedRexDateTime, setSelectedRexDateTime] = useState<string>(null);

  /*** end Eyeball menu toggles */

  const [rexPetTime, setRexPetTime] = useState(""); // used to update the PET value via the PetInterval component

  const [mapZoom, setMapZoom] = useState<number>(0); // Used to trigger re-draw of scale. Value doens't matter
  const [gridLabels, setGridLabels] = useState<GridLabelItem[]>([]);
  const [mapBounds, setMapBounds] = useState<L.LatLngBoundsLiteral>(null); // Used to trigger re-draw of grid labels. Value doens't matter
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [isWin10, setIsWin10] = useState<boolean>(false);

  // Default follow options for stations and traverses
  const defaultFollowOptions: MapFollowOptions = useMemo(
    () => ({
      stations: { follow: true, name: "Stations" },
      traverses: { follow: true, name: "Traverses" },
    }),
    []
  );

  const [followModeOptions, setFollowModeOptions] =
    useState<MapFollowOptions>(defaultFollowOptions);
  const [followMode, setfollowMode] = useState<boolean>(true);

  const getMapBounds = (): L.LatLngBoundsLiteral => {
    if (!map.current) return null;
    const size: L.Point = map.current.getSize();
    const northWest = map.current.containerPointToLatLng([0, 0]);
    const northEast = map.current.containerPointToLatLng([size.x, 0]);
    const southWest = map.current.containerPointToLatLng([0, size.y]);
    const southEast = map.current.containerPointToLatLng([size.x, size.y]);
    return [
      [southWest.lat, southWest.lng],
      [northEast.lat, northEast.lng],
      [northWest.lat, northWest.lng],
      [southEast.lat, southEast.lng],
    ];
  };

  // Update followModeOptions when runningRexFromDb.posTypes changes
  useEffect(() => {
    if (!runningRexFromDb?.posTypes) return;

    const followPosOptions: MapFollowOptions = runningRexFromDb.posTypes.reduce(
      (followOptionsForPos: MapFollowOptions, posType: PosType) => {
        followOptionsForPos[posType.uuid] = {
          follow: posType.name === "EV1" || posType.name === "EV2",
          name: posType.name,
        };
        return followOptionsForPos;
      },
      {}
    );

    setFollowModeOptions((prevOptions) => ({
      ...defaultFollowOptions,
      ...followPosOptions,
      // Preserve any existing follow state for pos types that haven't changed
      ...Object.keys(prevOptions).reduce((preserved, key) => {
        if (key !== "stations" && key !== "traverses" && followPosOptions[key]) {
          preserved[key] = {
            ...followPosOptions[key],
            follow: prevOptions[key]?.follow ?? followPosOptions[key].follow,
          };
        }
        return preserved;
      }, {} as MapFollowOptions),
    }));
  }, [runningRexFromDb?.posTypes, defaultFollowOptions]);

  // put this in a useCallback so props isn't a dependency on map instantiation
  const updateBigMapBounds = useCallback(
    (mapBounds: L.LatLngBoundsLiteral) => {
      setMapBounds(mapBounds); // Used to trigger re-draw of grid labels
      setBigMapBounds(mapBounds);
    },
    [setBigMapBounds]
  );

  /**
   * Map instantiation
   */
  useLayoutEffect(() => {
    if (!mapRef.current || !map || !mission) return;

    const isWin10Async = async () => {
      const isWin10 = await isWindows10();
      setIsWin10(isWin10);
    };
    isWin10Async();

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
      });

      map.current.on("zoomend", () => {
        // set the map bounds
        const boundsArray: L.LatLngBoundsLiteral = getMapBounds();
        updateBigMapBounds(boundsArray);
        setMapZoom(map.current.getZoom());
      });

      map.current.on("moveend", () => {
        // set the map bounds
        const boundsArray: L.LatLngBoundsLiteral = getMapBounds();
        updateBigMapBounds(boundsArray);
      });

      map.current.on("load", () => {
        // set the map bounds
        const boundsArray: L.LatLngBoundsLiteral = getMapBounds();
        updateBigMapBounds(boundsArray);
      });
    }

    if (crs.current) {
      map.current.options.crs = crs.current;
    }

    if (!stationFeatureGroup.current) {
      stationFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!actionFeatureGroup.current) {
      actionFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!gridLabelFeatureGroup.current) {
      gridLabelFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!posEntryFeatureGroup.current) {
      posEntryFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
    if (!highlightFeatureGroup.current) {
      highlightFeatureGroup.current = L.featureGroup().addTo(map.current);
    }
  }, [mapRef, map, mission, updateBigMapBounds]);

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
   * Draw the scale bar on the map
   */
  const drawScaleBar = useCallback(() => {
    return scaleBarDiv(map, mission.planetRadius, styles.scaleValue);

    // Include mapZoom but we arn't using it. Just need a way to re-trigger this effect when mapZoom changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mission.planetRadius, mapZoom]);

  /**
   * Pan/zoom map view in follow mode
   */
  useEffect(() => {
    if (!followMode || !runningRexFromDb?.posTypes) return;
    let objectCoordinates: AEGISPoint[] = [];

    // get the coordinates of all objects that are in progress
    if (followModeOptions["stations"].follow) {
      for (const station of stationsInProgress) {
        objectCoordinates.push(station.location);
        for (const action of actionsFromDb) {
          if (action.stationUuid === station.uuid && action.location && action.enabled) {
            objectCoordinates.push(action.location);
          }
        }
      }
    }
    if (followModeOptions["traverses"].follow) {
      for (const traverse of traversesInProgress) {
        objectCoordinates = objectCoordinates.concat(traverse.path);
        for (const action of actionsFromDb) {
          if (action.traverseUuid === traverse.uuid && action.location && action.enabled) {
            objectCoordinates.push(action.location);
          }
        }
      }
    }
    for (const posTypeUuid in latestPosEntriesByType) {
      const lastPosEntry = latestPosEntriesByType[posTypeUuid][0];
      if (followModeOptions[posTypeUuid]?.follow) {
        objectCoordinates.push(lastPosEntry.location);
      }
    }
    // egress and ingress
    if (runningRexFromDb.xgressEntries?.["egress"]?.rexStatus === "in-progress") {
      let egressCoordinates: AEGISPoint;
      if (runningEvaFromDb?.egressLocationUuid === "lander") {
        egressCoordinates = mission.landerLocation;
      } else {
        egressCoordinates = stationsFromDb.find(
          (station) => station.uuid === runningEvaFromDb?.egressLocationUuid
        )?.location;
      }
      objectCoordinates.push(egressCoordinates);
    }
    if (runningRexFromDb.xgressEntries?.["ingress"]?.rexStatus === "in-progress") {
      let ingressCoordinates: AEGISPoint;
      if (runningEvaFromDb?.ingressLocationUuid === "lander") {
        ingressCoordinates = mission.landerLocation;
      } else {
        ingressCoordinates = stationsFromDb.find(
          (station) => station.uuid === runningEvaFromDb?.ingressLocationUuid
        )?.location;
      }
      objectCoordinates.push(ingressCoordinates);
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
      const maxZoom = mission.planetRadius === EARTH_RADIUS ? 19 : 17; // if on earth, 20 is max zoom, otherwise 18 (moon)
      map.current.fitBounds(bounds, { maxZoom, padding: [100, 100] });
    }
  }, [
    followModeOptions,
    mission,
    actionsFromDb,
    stationsInProgress,
    traversesInProgress,
    latestPosEntriesByType,
    followMode,
    runningEvaFromDb,
    stationsFromDb,
    runningRexFromDb,
  ]);

  /**
   * Whenever presets changes, update the local copy of the selected preset just incase that got changed too
   */
  useEffect(() => {
    if (!selectedPreset) return;
    const updatedSelectedPreset = presetsFromDb.find((p) => p.uuid === selectedPreset.uuid);
    setSelectedPreset(updatedSelectedPreset);
  }, [selectedPreset, presetsFromDb, setSelectedPreset]);

  /**
   * Map layers display management
   */
  useEffect(() => {
    if (!mission.id || !map.current || !selectedPreset || !missionLayers) return;

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
      missionId: mission.id,
      mapTime: null,
      setGridLabels,
    });
  }, [mission, map, missionLayers, missionSublayers, selectedPreset, mapDateTime]);

  /**
   * Update which grid labels are visible based on map zoom level
   */
  useEffect(() => {
    drawGridLabels({
      map,
      gridLabelFeatureGroup,
      gridLabels,
      planetRadius: mission.planetRadius,
    });
    // include map bounds in the dependency array so the grid labels will re-draw when map moves
  }, [gridLabels, mission.planetRadius, mapBounds]);

  /**
   * Determine stations to show and draw them on map when stations or selections change
   */
  useEffect(() => {
    if (!stationsFromDb || !map.current) return;

    const stationUuidsToShow: string[] = [];
    // always show the stations on a selected EVA
    if (runningEvaFromDb) {
      const stationSequenceItems = runningEvaFromDb.sequence.filter(
        (item) => item.type === "station"
      );
      stationUuidsToShow.push(...stationSequenceItems.map((item) => item.uuid));
      if (runningEvaFromDb.egressLocationUuid !== "lander")
        stationUuidsToShow.push(runningEvaFromDb.egressLocationUuid);
      if (runningEvaFromDb.ingressLocationUuid !== "lander")
        stationUuidsToShow.push(runningEvaFromDb.ingressLocationUuid);
    }

    // for the rest of the stations (not selected), check eyeball menu setting and folder settings
    if (mapDisplayStations.show) {
      stationUuidsToShow.push(...asPlannedStationUuids);
    }

    // remove all stations from the map
    stationFeatureGroup.current.clearLayers();

    // get the station object for all the station uuids to show
    const stationsToShow: Station[] = stationsFromDb.filter((station) =>
      stationUuidsToShow.includes(station.uuid)
    );

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
          tooltipOptions: {
            className: styles.tooltip,
            permanent: mapDisplayStations.showLabels,
            opacity: 0.65,
          },
        });
      }
    });

    stationFeatureGroup.current.setZIndex(999);
  }, [
    stationsFromDb,
    runningEvaFromDb,
    mapDisplayStations,
    isWin10,
    asPlannedStationUuids,
    selectedEva,
  ]);

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
   * Determine actions to show and draw them on map when actions or selections change
   */
  useEffect(() => {
    if (!actionsFromDb || !map.current) return;

    let actionsToShow: Action[] = [];
    if (mapDisplayActions.show) {
      const actionsInStation = actionsFromDb.filter(
        (action) =>
          stationsInProgress.map((s) => s.uuid).includes(action.stationUuid) && action.enabled
      );
      const actionsInTraverse = actionsFromDb.filter(
        (action) =>
          traversesInProgress.map((s) => s.uuid).includes(action.traverseUuid) && action.enabled
      );
      actionsToShow = [...actionsInStation, ...actionsInTraverse];
    }

    // delete all actions in leaflet
    actionFeatureGroup.current.clearLayers();

    // draw or update all actions
    actionsToShow.forEach((action) => {
      if (action.location) {
        drawOrUpdateMarkerOnMap({
          map,
          featureGroup: actionFeatureGroup,
          name: `${titleCase(action.type)}: ${action.name}`,
          uuid: action.uuid,
          iconEmoji: action.icon ? action.icon : "2754", //default to question mark
          mapItemType: "action",
          location: action.location,
          isWin10,
          iconClassName: styles.mapIcon,
          iconWin10ClassName: styles.mapIconWin10,
          iconWrapperClassName: styles.iconWrapper,
          tooltipOptions: {
            className: styles.tooltip,
            permanent: mapDisplayActions.showLabels,
            opacity: 0.65,
          },
        });
      }
    });
  }, [actionsFromDb, stationsInProgress, mapDisplayActions, isWin10, traversesInProgress]);

  /**
   * Determine traverses to show and draw them on map when traverses or selections change
   */
  useEffect(() => {
    if (!traversesFromDb || !map.current) return;

    let traversesToShow: Traverse[] = [];
    if (runningEvaFromDb) {
      const traverseSequenceItems = runningEvaFromDb.sequence.filter(
        (item) => item.type === "traverse"
      );
      const traversesInEva = traversesFromDb.filter((traverse) =>
        traverseSequenceItems.find((item) => item.uuid === traverse.uuid)
      );
      traversesToShow = traversesInEva;
    }

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
        showArrows,
        name: traverse.name,
        uuid: traverse.uuid,
        path: traverse.path,
        color: baseColor,
        mapItemType: "traverse",
        tooltipOptions: {
          className: styles.tooltip,
          opacity: 0.65,
        },
        polylineOptions: {
          weight: 8,
          outlineWeight: 0,
        },
        antPathWeight: 6,
        arrowHeadOptions: {
          pixelSize: 25,
        },
        arrowPatternProp: {
          repeat: 140,
        },
      });
    });
  }, [traversesFromDb, runningEvaFromDb, showArrows]);

  /**
   * Draw circles around the lander for each circle definition
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
   * Set grid settings
   */
  useEffect(() => {
    if (!map || !mapBounds || !globalGrid?.coordinates || !gridCorner || !selectedPreset) return;

    if (selectedPreset.mapGridControl?.visible) {
      const size: L.Point = map.current.getSize();
      const gridStart: AEGISPoint = convertLeafletLatLngToAegisPoint(
        map.current.containerPointToLatLng([0, 0])
      );
      const gridEnd: AEGISPoint = convertLeafletLatLngToAegisPoint(
        map.current.containerPointToLatLng([size.x, size.y])
      );

      setGridBounds([
        findClosestPointInGlobalGrid(globalGrid.coordinates, gridStart, mission.planetRadius),
        findClosestPointInGlobalGrid(globalGrid.coordinates, gridEnd, mission.planetRadius),
      ]);
      setMapGridControls(selectedPreset.mapGridControl);
    } else {
      setGridBounds(null);
      setMapGridControls(null);
    }
  }, [gridCorner, map, mapBounds, mapZoom, mission.id, mission.planetRadius, selectedPreset]);

  /**
   * Draw grid
   */
  useEffect(() => {
    if (!map || !mission?.planetRadius || !mapBounds || !globalGrid?.coordinates) return;

    map.current.eachLayer((layer: AEGISGeoJSONGrid | AEGISGeoJSONGridPoint) => {
      if (layer?.mapItemType === "Grid System" || layer?.mapItemType === "Grid Point") {
        layer.remove();
      }
    });

    if (!gridBounds || !mapGridControls) return;

    const gridCoordinates: MissionGridPoint[][] = globalGrid.coordinates;

    const basePointsShown =
      (gridBounds[1].row - gridBounds[0].row) * (gridBounds[1].col - gridBounds[0].col);
    let lineZoomLevel = 50;
    if (basePointsShown < 500) {
      lineZoomLevel = 1;
    } else if (basePointsShown < 4000) {
      lineZoomLevel = 10;
    }

    const startIndex: GridIndex = adjustGridIndex(
      gridBounds[0],
      globalGrid.coordinates.length,
      globalGrid.coordinates[0].length,
      lineZoomLevel,
      true
    );
    const endIndex: GridIndex = adjustGridIndex(
      gridBounds[1],
      globalGrid.coordinates.length,
      globalGrid.coordinates[0].length,
      lineZoomLevel,
      false
    );

    const lines: Feature[] = [];
    for (let i = endIndex.row; i >= startIndex.row; i -= lineZoomLevel) {
      lines.push(
        lineString([
          [
            gridCoordinates[i][startIndex.col].coordinates.lng,
            gridCoordinates[i][startIndex.col].coordinates.lat,
          ],
          [
            gridCoordinates[i][endIndex.col].coordinates.lng,
            gridCoordinates[i][endIndex.col].coordinates.lat,
          ],
        ])
      );
    }

    for (let i = startIndex.col; i <= endIndex.col; i += lineZoomLevel) {
      lines.push(
        lineString([
          [
            gridCoordinates[startIndex.row][i].coordinates.lng,
            gridCoordinates[startIndex.row][i].coordinates.lat,
          ],
          [
            gridCoordinates[endIndex.row][i].coordinates.lng,
            gridCoordinates[endIndex.row][i].coordinates.lat,
          ],
        ])
      );
    }

    const geoJSONGrid: AEGISGeoJSONGrid = L.geoJSON(featureCollection(lines), {
      style: {
        interactive: false,
        fillColor: "none",
        ...mapGridControls.style,
      },
    }) as AEGISGeoJSONGrid;
    geoJSONGrid.mapItemType = "Grid System";
    map.current.addLayer(geoJSONGrid);

    if (mapGridControls.labelsVisible) {
      for (let i = endIndex.row; i >= startIndex.row; i -= lineZoomLevel) {
        for (let j = startIndex.col; j < endIndex.col; j += lineZoomLevel) {
          if (i !== startIndex.row && j !== endIndex.col) {
            const point: MissionGridPoint = gridCoordinates[i][j];
            if (point.name === null) {
              continue;
            }
            const latLng: L.LatLng = { ...point.coordinates } as L.LatLng;
            const marker: AEGISGeoJSONGridPoint = L.tooltip({
              sticky: false,
              direction: "right",
              offset: new L.Point(0, -8),
              permanent: true,
              className: "leaflet-tooltip-gridLabels-dashboard",
              interactive: false,
              opacity: 0.5,
            })
              .setLatLng(latLng)
              .setContent(point.name) as AEGISGeoJSONGridPoint;
            marker.mapItemType = "Grid Point";
            marker.addTo(map.current);
          }
        }
      }
    }
  }, [
    mission?.planetRadius,
    map,
    mapZoom,
    mapBounds,
    mission.id,
    mission.activeGridUuid,
    gridBounds,
    mapGridControls,
  ]);

  /**
   * Draw lander
   */
  useEffect(() => {
    if (!map.current || !mission.landerLocation) return;

    drawLanderOnMap({
      map,
      location: mission.landerLocation,
      sizePx: 39, // bigger than default 30px
      tooltipOptions: {
        className: styles.tooltip,
        permanent: false,
        opacity: 0.65,
      },
    });
  }, [map, mission, isWin10]);

  /**
   * Drawings to update when stations in progress changes
   */
  useEffect(() => {
    if (!map.current) return;
    // remove all walkback traverses from the map
    map.current.eachLayer((layer: AEGISMarker | AEGISPolyline) => {
      if (layer.mapItemType === "walkback") {
        map.current.removeLayer(layer);
      }
    });

    // draw the walkback traverse
    if (mapDisplayStations.showWalkbacks && stationsInProgress.length > 0) {
      for (const station of stationsInProgress) {
        if (station.walkbackPath) {
          drawPolylineOnMap({
            map,
            showArrows,
            name: station.name,
            uuid: station.uuid,
            mapItemType: "walkback",
            path: station.walkbackPath,
            color: "#cb0000",
            dashArray: "30, 15",
            tooltipOptions: {
              className: styles.tooltip,
              opacity: 0.65,
            },
            polylineOptions: {
              weight: 5,
              outlineWeight: 0,
            },
            arrowHeadOptions: {
              pixelSize: 20,
            },
          });
        }
      }
    }
    // draw green circles around the stations
    highlightFeatureGroup.current.clearLayers();

    for (const station of stationsInProgress) {
      const marker = L.circleMarker(
        { lat: station.location.lat, lng: station.location.lng },
        {
          radius: 40,
          color: "#52f075",
          stroke: true,
          weight: 4,
          fill: false,
        }
      ) as AEGISCircleMarker;
      marker.bringToFront();
      highlightFeatureGroup.current.addLayer(marker);
    }
  }, [map, stationsInProgress, showArrows, mapDisplayStations.showWalkbacks]);

  /**
   * General Pos Entry drawing function. Determines which pos entries to show and draws them on the map. Also determines latest pos entries for each pos type.
   */
  useEffect(() => {
    if (!map.current || !runningRexFromDb) return;

    let posEntriesToShow: PosEntry[] = [];
    let posTypeLatestEntries: { [key: string]: PosEntry[] } = {};

    // determine which pos entries to show
    if (mapDisplayPos.show) {
      const posEntriesWithLocations = runningRexFromDb.posEntries?.filter(
        (posEntry) => posEntry.location
      );
      // filter out the pos entries that are not from a selected source. Empty source array means "all".
      let filteredPosEntries: PosEntry[] = [];
      // Filter out any undefined values from sourceUuids before checking length
      const validSourceUuids = mapDisplayPos.sourceUuids.filter((uuid) => uuid != null);
      if (validSourceUuids.length > 0) {
        filteredPosEntries = posEntriesWithLocations?.filter((posEntry) =>
          validSourceUuids.includes(posEntry.posSourceUuid)
        );
      } else {
        filteredPosEntries = posEntriesWithLocations;
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
      if (!mapDisplayPos.showMarkers) break; //exit for, no markers need to be drawn
      if (!posEntry.location) continue; // go to next pos entry
      if (isEqual(posEntry.location, egressLocation)) continue; // don't draw pos entries on top of lander

      // determine if this is one of the latest entries. If so, determine which latest pos types exist in this entry
      const customPosTypesUuids: string[] = [];

      let isRecent = false;
      posEntry.posTypeUuids.forEach((posTypeUuid) => {
        if (posTypeLatestEntries[posTypeUuid]?.[0]?.uuid === posEntry.uuid) {
          isRecent = true;
          customPosTypesUuids.push(posTypeUuid);
        }
      });

      // determine if this position entry should be drawn
      if (!mapDisplayPos.showOldMarkers) {
        if (!isRecent) continue; //this is an old pos entry, go to next entry
      }
      // all pos entries are being drawn. determine if this entry should be faded
      let opacity: number = 1;
      if (mapDisplayPos.fadeOldMarkers) {
        let lastEntry = false;
        // check if this is the latest (most recent) entry for a pos type
        for (const posTypeUuid in posTypeLatestEntries) {
          if (posTypeLatestEntries[posTypeUuid]?.[0]?.uuid === posEntry.uuid) {
            lastEntry = true;
            break;
          }
        }
        if (!lastEntry) opacity = 0.4;
      }

      // determine if label tooltip should be shown permanently or only on mouseover.
      let keepTooltipOpen = mapDisplayPos.showAllLabels;
      if (mapDisplayPos.showLatestLabels) {
        // check each pos type for this pos entry
        posEntry.posTypeUuids.forEach((posTypeUuid) => {
          if (posTypeLatestEntries[posTypeUuid]?.[0]?.uuid === posEntry.uuid) {
            keepTooltipOpen = true;
          }
        });
      }

      drawPosMarkerOnMap({
        map,
        posEntry: posEntry,
        posEntryFeatureGroup,
        selectedOrRunningRex: runningRexFromDb,
        markerOptions: { opacity },
        tooltipOptions: { opacity: 0.65, className: styles.tooltip, permanent: keepTooltipOpen },
        overridePosTypesUuidsToDraw: customPosTypesUuids.length > 0 ? customPosTypesUuids : null,
        isWin10,
        showOldMarkers: mapDisplayPos.showOldMarkers,
        showLatestLabels: mapDisplayPos.showLatestLabels,
        rexPetTime,
        iconClassName: styles.posIcon,
        iconWin10ClassName: styles.posIconWin10,
        iconWrapperClassName: styles.iconWrapper,
        barClassName: styles.posBar,
        overrideEVIcon: true,
        miniMap: false,
        barOffset: 8,
      });
    }

    // draw or update path
    if (mapDisplayPos.showPaths) {
      //hide old paths
      if (!mapDisplayPos.showOldPaths) {
        for (const posType of runningRexFromDb.posTypes) {
          if (!posTypeLatestEntries[posType.uuid] || posTypeLatestEntries[posType.uuid].length <= 1)
            continue;
          //loop over posTypes and get their latest entries
          drawPosPathOnMap({
            posEntryFeatureGroup,
            coords: reverse(
              posTypeLatestEntries[posType.uuid].map((posEntry) => {
                return posEntry.location;
              })
            ),
            uuid: posType.uuid,
            polylineOptions: {
              opacity: 0.6, //default path opacity
              color: posType.pathColor,
              weight: 4,
            },
          });
        }
      } else {
        // show all paths
        const posTypes = runningRexFromDb.posTypes;
        posTypes?.forEach((posType) => {
          const posEntriesForType = posEntriesToShow.filter((posEntry) =>
            posEntry.posTypeUuids.includes(posType.uuid)
          );

          if (posEntriesForType.length > 1) {
            // determine if should fade old paths
            if (mapDisplayPos.fadeOldPaths) {
              // fade old paths
              drawPosPathOnMap({
                posEntryFeatureGroup,
                coords: reverse(
                  posEntriesForType.slice(1).map((posEntry) => {
                    return posEntry.location;
                  })
                ),
                uuid: `${posType.uuid} faded`,
                polylineOptions: {
                  opacity: 0.3,
                  color: posType.pathColor,
                  weight: 4,
                },
              });
              // latest path is a separate polyline thats not faded
              drawPosPathOnMap({
                posEntryFeatureGroup,
                coords: reverse(
                  posEntriesForType.slice(0, 2).map((posEntry) => {
                    return posEntry.location;
                  })
                ),
                uuid: posType.uuid,
                polylineOptions: {
                  opacity: 0.6, //default path opacity
                  color: posType.pathColor,
                  weight: 4,
                },
              });
            } else {
              // no fade
              drawPosPathOnMap({
                posEntryFeatureGroup,
                coords: reverse(
                  posEntriesForType.map((posEntry) => {
                    return posEntry.location;
                  })
                ),
                uuid: posType.uuid,
                polylineOptions: {
                  opacity: 0.6, //default path opacity
                  color: posType.pathColor,
                  weight: 4,
                },
              });
            }
          }
        });
      }
    }

    //set in local state to be used in other use effects. Do this last so markers exist
    setLatestPosEntriesByType(posTypeLatestEntries);
    setPosEntriesShowing(posEntriesToShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, mapDisplayPos, runningRexFromDb, isWin10, egressLocation]); // do not include dependency for rexPetTime

  /**
   * Update position entry tooltips when rex is ticking
   */
  useEffect(() => {
    if (!posEntriesShowing || posEntriesShowing.length === 0) return;
    const rexPetSeconds = secondsFromhhmmss(rexPetTime);

    // turn on latest label only
    if (mapDisplayPos.showLatestLabels) {
      // get a unique array of the latest pos entries. Multiple types may share the same entry
      const uniqueLatestPosEntries = uniqBy(
        Object.values(latestPosEntriesByType).map((posEntries) => {
          return posEntries[0];
        }),
        "uuid"
      );
      for (const latestPosEntry of orderBy(uniqueLatestPosEntries, ["createdAt", "asc"])) {
        const posMarker = getMapItemByUuid(map, latestPosEntry.uuid) as AEGISMarker;
        if (!posMarker) continue;

        // build the abbreviation string
        const markerPosTypeAbbrs: string[] = [];
        for (const posTypeUuidFromEntry of latestPosEntry.posTypeUuids) {
          // check if this entryPosType is in any other more recent posEntry
          const otherPosEntriesWithThisType = uniqueLatestPosEntries.filter(
            (entry) =>
              entry.posTypeUuids.includes(posTypeUuidFromEntry) &&
              entry.createdAt > latestPosEntry.createdAt
          );
          if (otherPosEntriesWithThisType.length === 0) {
            const posTypeAbbr = runningRexFromDb?.posTypes?.find(
              (posTypeFromRex) => posTypeFromRex.uuid === posTypeUuidFromEntry
            )?.abbr;
            markerPosTypeAbbrs.push(posTypeAbbr);
          }
        }

        // set the marker tooltip
        const timeToShow = hhmmssFromSeconds(rexPetSeconds - latestPosEntry.petSeconds);
        const sourceAbbr = runningRexFromDb?.posSources?.find(
          (posSource) => posSource.uuid === latestPosEntry.posSourceUuid
        )?.abbr;
        const newLabel = `${timeToShow} / ${markerPosTypeAbbrs} (${sourceAbbr})`;
        posMarker.setTooltipContent(newLabel);
      }
    } else {
      // update all timers on all tooltips
      for (let i = 0; i < posEntriesShowing.length; i++) {
        //build label
        const timeToShow = hhmmssFromSeconds(rexPetSeconds - posEntriesShowing[i].petSeconds);
        const sourceAbbr = runningRexFromDb?.posSources?.find(
          (posSource) => posSource.uuid === posEntriesShowing[i].posSourceUuid
        )?.abbr;
        const markerPosTypeAbbrs = posEntriesShowing[i].posTypeUuids.map((posTypeUuid) => {
          const posType = runningRexFromDb?.posTypes?.find(
            (posType) => posType.uuid === posTypeUuid
          );
          return posType?.abbr;
        });
        const newLabel = `${timeToShow} / ${markerPosTypeAbbrs} (${sourceAbbr})`;

        const posMarker = getMapItemByUuid(map, posEntriesShowing[i].uuid) as AEGISMarker;
        if (posMarker) {
          posMarker.setTooltipContent(newLabel);
        }
      }
    }
  }, [rexPetTime, posEntriesShowing, latestPosEntriesByType, mapDisplayPos, runningRexFromDb]);

  return (
    <div
      className={styles.mapContainer}
      onMouseEnter={() => {
        setShowMenu(true);
      }}
      onMouseLeave={() => {
        setShowMenu(false);
      }}
      ref={mapContainerRef}
    >
      <PetInterval
        runningRex={runningRexFromDb}
        rexPetTime={rexPetTime}
        setRexPetTime={setRexPetTime}
      />
      <div className={styles.map} ref={mapRef} />
      <div className={`${!showMenu && styles.hide}`}>
        <div className={`${styles.mapViewDisplay} `}>
          <MapViewMenu
            mapDisplayPois={mapDisplayPois}
            setMapDisplayPois={setMapDisplayPois}
            mapDisplayStations={mapDisplayStations}
            setMapDisplayStations={setMapDisplayStations}
            mapDisplayActions={mapDisplayActions}
            setMapDisplayActions={setMapDisplayActions}
            showArrows={showArrows}
            setShowArrows={setShowArrows}
            mapDisplayPos={mapDisplayPos}
            setMapDisplayPos={setMapDisplayPos}
            showScaleBar={showScaleBar}
            setShowScaleBar={setShowScaleBar}
            showMouseLatLon={false}
            setShowMouseLatLon={() => {}}
            showSunEarth={showSunEarth}
            setShowSunEarth={setShowSunEarth}
          />
        </div>
        <div className={styles.followWrapper}>
          <div className={styles.followMenu}>
            <div
              className={styles.followButtonWrapper}
              onClick={(e) => {
                setfollowMode(!followMode);
                e.stopPropagation();
              }}
              data-tooltip-id="aegis-tooltip"
              data-tooltip-html="Toggle Follow Mode"
            >
              <div className={`${styles.followButton} ${followMode && styles.followSelected}`}>
                Auto Pan/Zoom Map
              </div>
            </div>
            <div className={styles.followDropdownWrapper}>
              <MultiSelectDropdown
                items={[
                  { label: "Stations", value: "stations" },
                  { label: "Traverses", value: "traverses" },
                ].concat(
                  runningRexFromDb.posTypes.map((posType) => {
                    return { label: posType.name, value: posType.uuid };
                  })
                )}
                // selectedItemValues just takes a string array of values
                //  so pull out all the properties from followModeOptions that have follow
                //  turned on and return their uuids in a string array
                selectedItemsValues={Object.keys(followModeOptions).reduce(
                  (selectedUuids: string[], uuidKey) => {
                    if (followModeOptions[uuidKey].follow) {
                      selectedUuids.push(uuidKey);
                    }
                    return selectedUuids;
                  },
                  []
                )}
                toggleItem={(itemValue: string) => {
                  setFollowModeOptions({
                    ...followModeOptions,
                    [itemValue]: {
                      ...followModeOptions[itemValue],
                      follow: !followModeOptions[itemValue].follow,
                    },
                  });
                }}
                titleLabel="Select Items to Follow"
                containerClassName={styles.followDropdown}
                headerClassName={styles.followDropdownHeader}
              />
            </div>
          </div>
        </div>
        <div className={styles.presetDisplay}>
          <PresetMenu
            selectedPreset={selectedPreset}
            setSelectedPreset={setSelectedPreset}
            presetsFromDb={presetsFromDb}
          />
        </div>
      </div>
      <div className={styles.mapScaleDisplay}>{showScaleBar && drawScaleBar()}</div>
      {showSunEarth && <SunEarth type="dashboard" selectedPreset={selectedPreset} />}
    </div>
  );
};

export default MapBody;
