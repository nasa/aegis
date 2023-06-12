import type { NextPage } from "next";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useAppDispatch } from "utils/useAppDispatch";
import { useAppSelector, shallowEqual, refEqual } from "utils/useAppSelector";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

import styles from "./mission.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import * as InternalAPI from "http-client/internal-api";
import { getMissions } from "http-client/mission";
import { getLayers } from "http-client/layer";
import { getStations } from "http-client/station";
import { getActions } from "http-client/action";
import { getGoals, getInvestigations, getObjectives } from "http-client/stm";
import { setMapLayerControls } from "store/map";
import { setPois, setPoisFromDb } from "store/poi";
import {
  setPresetUIStates,
  setPresets,
  setPresetsFromDb,
  setSelectedPresetUuid,
} from "store/preset";
import { setLayers, setMission } from "store/mission";
import { clearIronSessionData, setIronSessionData, setIsLoggedIn } from "store/user";
import { setStations, setStationsFromDb } from "store/station";
import { setActions, setActionsFromDb } from "store/action";
import { setGoals, setInvestigations, setObjectives } from "store/stm";
import { getEvas } from "http-client/eva";
import { setEvas, setEvasFromDb } from "store/eva";
import { setTraversesFromDb, setTraverses } from "store/traverse";
import { getTraverses } from "http-client/traverse";
import { setRightPanelOpen } from "store/interface";
import { thunkCreateStationCalculatedFields } from "store/thunk/thunkStation";
import { thunkCreateTraverseCalculatedFields } from "store/thunk/thunkTraverse";
import { thunkCreateEvasCalculatedFields } from "store/thunk/thunkEva";
import { thunkCreatePoiCalculatedFields } from "store/thunk/thunkPoi";
import { Tooltip } from "react-tooltip";
import { thunkSavePreset } from "store/thunk/thunkPreset";

/** Dynamically import the whole framework because nothing likes NextJS */
const LeftControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.LeftControlPanel),
  {
    ssr: false,
  }
);
const RightControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.RightControlPanel),
  {
    ssr: false,
  }
);
const MapBody = dynamic(import("components/interface/map-body-leaflet"), {
  ssr: false,
});
const Header = dynamic(import("components/interface/header"), {
  ssr: false,
});

const BottomControlPanel = dynamic(
  import("components/interface/side-controls").then((mod) => mod.BottomControlPanel),
  {
    ssr: false,
  }
);

const Main: NextPage = () => {
  const dispatch = useDispatch();
  const thunkDispatch = useAppDispatch();
  const router = useRouter();
  const missionStore = useAppSelector((state) => state.mission, shallowEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, refEqual);
  const pois = useAppSelector((state) => state.poi.pois, shallowEqual);
  const stations = useAppSelector((state) => state.station.stations, shallowEqual);
  const actions = useAppSelector((state) => state.action.actions, shallowEqual);
  const traverses = useAppSelector((state) => state.traverse.traverses, shallowEqual);
  const evas = useAppSelector((state) => state.eva.evas, shallowEqual);
  const stationsCalculatedFields = useAppSelector(
    (state) => state.station.calculatedFields,
    shallowEqual
  );
  const traversesCalculatedFields = useAppSelector(
    (state) => state.traverse.calculatedFields,
    shallowEqual
  );

  /**
   * Check if user is logged in.
   * If so, populate the user store data.
   * If not, redirect them to the login page.
   */

  useEffect(() => {
    (async () => {
      const response = await InternalAPI.isLoggedIn();
      if (response.status === "success") {
        dispatch(setIsLoggedIn(true));
        dispatch(setIronSessionData(response.data));
      } else {
        dispatch(setIsLoggedIn(false));
        dispatch(clearIronSessionData());
        await router.push("/");
      }
    })();
  }, [dispatch, router]);

  /**
   * Populate the store
   */
  useEffect(() => {
    const { id } = router.query;
    if (!id || !dispatch) return;
    const intMissionId = parseInt(Array.isArray(id) ? id[0] : id);
    (async () => {
      //populate mission
      const missionData = await getMissions(intMissionId);
      if (missionData.data) {
        dispatch(setMission(missionData.data[0]));
      }

      //used to find uuids in preset map layer controls
      const flatLayerNamesAndUuids: { name: string; uuid: string }[] = [];

      //populate layers and layerControls
      const layerData = await getLayers(intMissionId);
      const mapLayerControls: MapLayerControls = {};

      if (layerData.data) {
        //populate mission layers
        dispatch(setLayers(layerData.data));

        //populate map layerControls
        layerData.data.map((configLayer) => {
          //add header layers
          mapLayerControls[configLayer.layerConfig.name] = {
            name: configLayer.layerConfig.name,
            uuid: configLayer.uuid,
            visible: false,
            type: configLayer.layerConfig.type,
            mapLayerRef: null,
            style: null,
          };
          flatLayerNamesAndUuids.push({
            name: configLayer.layerConfig.name,
            uuid: configLayer.uuid,
          });

          //add sublayers
          if (configLayer.layerConfig.sublayers) {
            configLayer.layerConfig.sublayers.map((sublayer) => {
              mapLayerControls[sublayer.name] = {
                name: sublayer.name,
                uuid: sublayer.uuid,
                visible: false,
                type: sublayer.type,
                mapLayerRef: null,
                style: {
                  opacity: sublayer.style?.opacity || 1,
                  contrast: 1,
                  brightness: 1,
                  saturation: 1,
                  blendMode: "normal",
                  color: sublayer.style?.color || "#FFFFFF",
                  weight: sublayer.style?.weight || 1,
                  fillColor: sublayer.style?.fillColor || "#FFFFFF",
                  fillOpacity: sublayer.style?.fillOpacity || 0.2,
                },
              };
              flatLayerNamesAndUuids.push({ name: sublayer.name, uuid: sublayer.uuid });
            });
          }
        });
        dispatch(setMapLayerControls(mapLayerControls));
      }

      //Populate Presets
      const presetData: Preset[] = (await InternalAPI.getPresets(intMissionId)).data;
      if (presetData) {
        const mapLayerControlKeys = Object.keys(mapLayerControls); //name of layer

        //validate against modifications to layers made in admin since this preset was last saved
        presetData.forEach((preset) => {
          let modified = false;
          const presetUIStates: PresetUIStates = {};
          //loop through the layer controls from the map
          for (const layerName of mapLayerControlKeys) {
            //build preset ui states
            presetUIStates[layerName] = {
              expanded: true,
              tabSelected: null,
            };

            //add any UUIDs that are missing from preset's layer control
            //  this happens when UUIDs are updated in admin after the preset was created
            if (!preset.mapLayerControls[layerName].uuid) {
              //find the layer from the mission to get the UUID
              for (const layerNameAndUuid of flatLayerNamesAndUuids) {
                if (layerNameAndUuid.name === layerName) {
                  preset.mapLayerControls[layerName].uuid = layerNameAndUuid.uuid;
                  modified = true;
                  break;
                }
              }
            }

            //add any layer controls that are missing from preset
            //  this happens when layers are added in admin after the preset was created
            if (!Object.keys(preset.mapLayerControls).includes(layerName)) {
              preset.mapLayerControls[layerName] = mapLayerControls[layerName];
              modified = true;
            }
          }

          //loop through preset layer controls and delete any layer controls that no longer exist
          //  this happens when layers are deleted in admin after the preset was created
          for (const key of Object.keys(preset.mapLayerControls)) {
            if (!mapLayerControlKeys.includes(key)) {
              delete preset.mapLayerControls[key];
              modified = true;
            }
          }

          dispatch(
            setPresetUIStates({
              presetUuid: preset.uuid,
              presetUIStates: presetUIStates,
            })
          );

          //update this preset in the DB if any layer control changes we made
          if (modified) thunkDispatch(thunkSavePreset({ preset }));
        });

        dispatch(setPresets(presetData));
        dispatch(setPresetsFromDb(presetData));
        // Set the default preset
        const defaultPreset = presetData.filter((preset) => preset.missionPresetDefault === true);
        if (defaultPreset.length > 0) {
          dispatch(setSelectedPresetUuid(defaultPreset[0].uuid));
          dispatch(setMapLayerControls(defaultPreset[0].mapLayerControls));
        }
      }

      //Populate POIs
      const poiData = await InternalAPI.getPOIs(intMissionId);
      if (poiData.data) {
        dispatch(setPois(poiData.data));
        dispatch(setPoisFromDb(poiData.data));
      }

      //Populate stations
      const stationData = await getStations(intMissionId);
      if (stationData.data) {
        dispatch(setStations(stationData.data));
        dispatch(setStationsFromDb(stationData.data));
      }

      //Populate actions
      const actionData = await getActions({ missionId: intMissionId });
      if (actionData.data) {
        dispatch(setActions(actionData.data));
        dispatch(setActionsFromDb(actionData.data));
      }

      //Populate evas
      const evaData = await getEvas(intMissionId);
      if (evaData.data) {
        dispatch(setEvas(evaData.data));
        dispatch(setEvasFromDb(evaData.data));
      }

      //Populate traverses //TODO: Does this have to load only current user's traverses?
      const traverseData = await getTraverses(intMissionId);
      if (traverseData.data) {
        dispatch(setTraverses(traverseData.data));
        dispatch(setTraversesFromDb(traverseData.data));
      }

      //Populate stm
      const objectiveData = await getObjectives({ missionId: intMissionId });
      if (objectiveData.data) dispatch(setObjectives(objectiveData.data));
      const goalData = await getGoals({ missionId: intMissionId });
      if (goalData.data) dispatch(setGoals(goalData.data));
      const invstgData = await getInvestigations({ missionId: intMissionId });
      if (invstgData.data) dispatch(setInvestigations(invstgData.data));
    })();
  }, [router, dispatch, thunkDispatch]);

  //Generate poi calculated values
  useEffect(() => {
    if (!pois || !actions) return;
    thunkDispatch(thunkCreatePoiCalculatedFields());
  }, [pois, actions, thunkDispatch]);

  //Generate station calculated values
  useEffect(() => {
    if (!stations || !actions) return;
    thunkDispatch(thunkCreateStationCalculatedFields());
  }, [stations, actions, thunkDispatch]);

  //Generate traverse calculated values
  useEffect(() => {
    if (!traverses) return;
    thunkDispatch(thunkCreateTraverseCalculatedFields());
  }, [traverses, thunkDispatch]);

  //Generate eva calculated values. These are dependent on stations and traverses having had their calculated values generated
  useEffect(() => {
    if (!evas || !stationsCalculatedFields || !traversesCalculatedFields) return;
    thunkDispatch(thunkCreateEvasCalculatedFields());
  }, [evas, stationsCalculatedFields, traversesCalculatedFields, thunkDispatch]);

  return (
    <div className={styles.page}>
      <Tooltip id="aegis-tooltip" className={styles.tooltip} clickable={true} delayShow={1000} />
      <div className={styles.header}>
        <Header />
      </div>
      <div className={styles.body}>
        <div className={styles.leftControl}>
          <LeftControlPanel />
        </div>
        <div className={styles.mapBody}>
          {missionStore.mission && missionStore.layers && <MapBody />}
        </div>
        <div
          className={styles.drawerSlider}
          onClick={() => dispatch(setRightPanelOpen(!rightPanelOpen))}
        >
          <div className={styles.circle}>
            {rightPanelOpen ? (
              <FontAwesomeIcon className={styles.drawerIcon} color="white" icon={faChevronRight} />
            ) : (
              <FontAwesomeIcon className={styles.drawerIcon} color="white" icon={faChevronLeft} />
            )}
          </div>
        </div>
        {rightPanelOpen && (
          <div className={styles.rightControl}>
            <RightControlPanel />
          </div>
        )}
      </div>
      <div className={styles.bottomControl}>
        <BottomControlPanel />
      </div>
    </div>
  );
};

export default Main;
