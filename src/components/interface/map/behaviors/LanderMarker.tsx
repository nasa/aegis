/**
 * LanderMarker — behavior component that draws/updates the lander icon on the map.
 *
 * Reads the lander location from the mission Automerge doc and creates a single
 * Feature on a dedicated VectorLayer. Supports click and drag interactions
 * per mode config.
 *
 * Returns null — headless behavior component.
 */

import { useEffect, useRef, useState } from "react";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type { MapBrowserEvent } from "ol";
import type Geometry from "ol/geom/Geometry";
import { Translate } from "ol/interaction";
import { Collection } from "ol";

import { useMissionDocSelector } from "utils/useDocSelector";
import { deepEqual, refEqual, useAppSelector } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { setSectionSelected } from "store/interface";
import { setMapItemHoverUuid, setMapItemHoverType, clearMapItemHover } from "store/hover";
import { thunkSetRightPanelIsOpenIfAuto } from "store/thunk/thunkInterface";
import { thunkDocUpdateLanderLocation } from "store/thunk/thunkMission";
import { updateMapDirective } from "store/map";

import { useMapContext } from "../MapProvider";
import { MODE_CONFIGS } from "../utils/modeConfig";
import { useCoordConverters } from "../hooks/useCoordConverters";
import { buildLanderStyle } from "../utils/styles/markers";
import { Z_INDEX } from "../utils/zIndex";

export function LanderMarker(): null {
  const { map, mode } = useMapContext();
  const config = MODE_CONFIGS[mode];
  const dispatch = useAppDispatch();
  const { toMapCoord, toAegisPoint } = useCoordConverters();

  const landerLocation = useMissionDocSelector(
    (doc) => doc.landerLocation,
    deepEqual
  ) as AEGISPoint | null;

  // While a marker/path edit is active, the lander stays visible but must be
  // non-interactive — otherwise the lander (which sits on a traverse's lander
  // endpoint) can be clicked or dragged mid-edit, pulling the frozen traverse
  // line away from the lander. This includes crew-position placement, matching
  // the other markers, so the lander can't be hovered/dragged during placement.
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);
  const editActive = !!mapDirective;

  // Refs to OL objects managed by this component
  const layerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const featureRef = useRef<Feature<Point> | null>(null);
  const translateRef = useRef<Translate | null>(null);
  const [featureExists, setFeatureExists] = useState(false);

  // --- Layer setup (once) ---
  useEffect(() => {
    const source = new VectorSource();
    const layer = new VectorLayer({
      source,
      zIndex: Z_INDEX.LANDER,
    });
    map.addLayer(layer);
    layerRef.current = layer;

    return () => {
      if (translateRef.current) map.removeInteraction(translateRef.current);
      map.removeLayer(layer);
      layerRef.current = null;
      featureRef.current = null;
    };
  }, [map]);

  // --- Feature sync ---
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const source = layer.getSource()!;

    if (!landerLocation || landerLocation.lat == null || landerLocation.lng == null) {
      source.clear();
      featureRef.current = null;
      setFeatureExists(false);
      return;
    }

    const coord = toMapCoord(landerLocation);
    const style = buildLanderStyle(config.lander.iconSize);

    if (featureRef.current) {
      // Update existing feature position
      const existing = featureRef.current.getGeometry()!;
      const [ex, ey] = existing.getCoordinates();
      if (ex !== coord[0] || ey !== coord[1]) {
        existing.setCoordinates(coord);
      }
      featureRef.current.setStyle(style);
    } else {
      // Create new feature
      const feature = new Feature(new Point(coord));
      feature.setId("lander");
      feature.setStyle(style);
      source.addFeature(feature);
      featureRef.current = feature;
      setFeatureExists(true);
    }
  }, [landerLocation, toMapCoord, config.lander.iconSize]);

  // --- Click handler ---
  useEffect(() => {
    if (!config.lander.clickable) return;
    if (editActive) return; // non-interactive during an edit

    const handleClick = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
      });
      if (hit && hit.getId() === "lander") {
        dispatch(setSectionSelected("mission"));
        dispatch(thunkSetRightPanelIsOpenIfAuto(true));
      }
    };

    map.on("click", handleClick);
    return () => map.un("click", handleClick);
  }, [map, config.lander.clickable, editActive, dispatch]);

  // --- Hover handler ---
  useEffect(() => {
    if (!config.lander.clickable) return;
    if (editActive) return; // non-interactive during an edit

    let isHovering = false;

    const handlePointerMove = (evt: MapBrowserEvent) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === layerRef.current,
      });
      if (hit && hit.getId() === "lander") {
        if (!isHovering) {
          dispatch(setMapItemHoverUuid("lander"));
          dispatch(setMapItemHoverType("lander"));
        }
        const el = map.getTargetElement();
        if (el) el.style.cursor = "pointer";
        isHovering = true;
      } else if (isHovering) {
        dispatch(clearMapItemHover());
        const el = map.getTargetElement();
        if (el) el.style.cursor = "";
        isHovering = false;
      }
    };

    map.on("pointermove", handlePointerMove);
    return () => {
      map.un("pointermove", handlePointerMove);
      if (isHovering) {
        dispatch(clearMapItemHover());
        isHovering = false;
      }
      const el = map.getTargetElement();
      if (el) el.style.cursor = "";
    };
  }, [map, config.lander.clickable, editActive, dispatch]);

  // --- Drag interaction ---
  useEffect(() => {
    if (!config.lander.draggable || !featureExists) return;
    // During an edit, reference markers must not be draggable — the edited item
    // is moved via InteractionManager's own Translate/Modify.
    if (editActive) return;

    const feature = featureRef.current!;
    const translate = new Translate({
      features: new Collection([feature]),
    });

    translate.on("translateend", (evt) => {
      const movedFeature = evt.features.item(0) as Feature<Point>;
      const newCoord = movedFeature.getGeometry()!.getCoordinates();
      const newLocation = toAegisPoint(newCoord);
      dispatch(thunkDocUpdateLanderLocation({ location: newLocation }));
      dispatch(updateMapDirective(null));
    });

    map.addInteraction(translate);
    translateRef.current = translate;

    return () => {
      map.removeInteraction(translate);
      translateRef.current = null;
    };
  }, [map, config.lander.draggable, editActive, featureExists, toAegisPoint, dispatch]);

  return null;
}
